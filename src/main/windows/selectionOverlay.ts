import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import log from 'electron-log/main';
import { clearElementAtProvider, loadRendererPage, setElementAtProvider } from './common';
import { claimEsc } from './escClaim';
import { clampToDisplay, Session, type Overlay, type Rect } from './selectionSession';
import {
  createMultiLocalElementAtProvider,
  createOverlayWindow,
  getAllDisplayRefs,
  getCursorDisplay,
  logDidFailLoad,
  onceRendererReady,
  promptAccessibilityIfMissing,
  refocusOnReadyToShow,
  startBackgroundPolling,
  startWindowInterval,
  type DisplayRef,
} from './overlayWindow';
import { sendBackgroundSnapshot } from '../capture/displaySnapshot';
import { getDockItems, listWindows, onSpaceChange, type WindowInfo } from '../windowsInfo';
import { tMain } from '../i18n/strings';


export type SelectionResult =
  | { kind: 'selected'; rect: Rect } |
  { kind: 'canceled' };

const CHANNEL_REGION = 'capture:region';
const CHANNEL_CANCEL = 'capture:cancel';
const CHANNEL_WINDOWS = 'capture:windows';

/**
 * 다음 회차 prewarm 지연 — BrowserWindow 동기 생성이 bg 캡처 완료 콜백보다 먼저
 * main thread 를 점유하지 않도록 캡처가 끝난 뒤로 미룬다. overlay 가 떠 있는
 * 동안엔 재-트리거가 불가능해 이 지연은 체감되지 않는다.
 */
const REPREWARM_DELAY_MS = 300;
/**
 * show 직후 fresh windows 조회 지연 — listWindows() 의 동기 FFI 가 bg 캡처 콜백을
 * 밀어내 magnifier 등장이 늦어지지 않도록 캡처가 보통 끝나는 시점 이후로 미룬다.
 * 그동안 스냅 UI 는 캐시본으로 동작한다.
 */
const FRESH_WINDOWS_DELAY_MS = 150;
/** koffi 동기 호출 cost 가 낮아서 빠르게 폴링 가능. Space 이벤트가 안 오는 환경의 fallback. */
const WINDOWS_POLL_MS = 400;
/** Space 전환 애니메이션(~300ms) 직후에야 listWindows 가 새 Space 의 창을 반환한다. */
const SPACE_SETTLE_DELAY_MS = 350;

/** 어떤 경로로 오버레이가 떴는지 — [perf] 콜드스타트 진단용. */
type ShowPath = 'prewarmed-ready' | 'prewarmed-loading' | 'cold';

type AcquiredWindow = { win: BrowserWindow; path: ShowPath };

type WindowsFeed = { sendCachedTo: (overlay: Overlay) => void };

/**
 * 영역 선택 오버레이 — 풀스크린 transparent BrowserWindow lifecycle 관리.
 *
 * 빠른 실행을 위한 두 가지 최적화:
 *
 * 1. prewarm() — 앱 시작 시 BrowserWindow + HTML 로드를 미리 수행하고,
 *    opacity 0 + 클릭 통과의 *invisible standby* 로 order-in 까지 해 둔다.
 *    show() 에서는 setBounds + setOpacity(1) 만 하면 된다 (order-in 비용 0).
 *
 * 2. windows 목록 캐시 — listWindows() 는 koffi FFI 동기 블로킹 호출.
 *    prewarm() 과 사용 후 백그라운드에서 미리 갱신해 두고,
 *    show() 에서는 캐시를 즉시 전송한다.
 *
 * show() 의 임계 경로:
 *   setBounds → sendBackgroundSnapshot 시작(CG in-process, 비차단) → win.show()
 *   → 캐시된 windows 즉시 전송. 동기 블로킹 작업(listWindows FFI·재-prewarm·
 *   getDockItems)은 전부 캡처 완료 이후 시점으로 지연 — magnifier 등장을 막지 않는다.
 *
 * 다중 모니터 (PR #9): 커서 모니터는 위의 standby 창으로 즉시 뜨고, 나머지 모니터는
 * 창을 하나씩 더 띄운다. 어느 창에서 선택·취소하든 세션 하나로 끝나 모든 창이 닫힌다.
 * 일반 드래그는 그 모니터 안으로 잘린다.
 */
export class SelectionOverlayManager {
  /** 커서 모니터의 기준 창 — 세션이 떠 있는지 판정·중복 show focus 용. */
  private win: BrowserWindow | null = null;
  /** 현재 세션의 모든 모니터 창 — stop() 이 함께 닫는다. */
  private overlays: Overlay[] = [];
  private prewarmed: BrowserWindow | null = null;
  /** prewarm 된 renderer 가 capture:ready 를 이미 보냈는지 추적. */
  private prewarmedReady = false;
  /** listWindows() 결과 캐시 — show() 에서 즉시 전송용. 첫 조회 전에는 null. */
  private cachedWindows: WindowInfo[] | null = null;
  /** getDockItems() 결과 캐시 — 매 전송마다 동기 AX IPC 를 돌지 않도록
   *  listWindows 갱신 시점에 함께 갱신한다. */
  private cachedDock: WindowInfo[] = [];
  private stopped = false;

  /**
   * 앱 시작 시 호출 — BrowserWindow 생성 + HTML 로드 + windows 목록 캐시를
   * 백그라운드에서 미리 수행한다. show() 호출 시 즉시 띄울 수 있도록 warm-up.
   */
  prewarm(): void {
    if (this.stopped || this.prewarmed) return;

    const startedAt = Date.now();
    const win = createOverlayWindow(getCursorDisplay().bounds);
    this.prewarmed = win;
    this.prewarmedReady = false;

    // invisible standby — opacity 0 + 클릭 통과 상태로 미리 window server 에
    // order-in 해 둔다 (showInactive: focus 안 뺏음). show() 시 setOpacity(1)
    // 만으로 표시되므로 숨김 창의 order-in + 첫 합성 비용이 사라진다 —
    // 네이티브 캡처(⌘⇧4)급 즉시 표시가 목표. 자기 pid 는 listWindows 에서
    // 걸러지므로(windowsInfo.ts) 스냅 후보로 잡히지 않는다.
    win.setIgnoreMouseEvents(true);
    win.setOpacity(0);
    win.showInactive();
    // 상시 order-in 된 standby 창이라 Mission Control 에서 빠졌는지 실기기에서 확인할 근거로 남긴다.
    log.info(`[asis] selection prewarm hiddenInMissionControl=${String(win.isHiddenInMissionControl())}`);

    loadRendererPage(win, 'selection').catch((err: unknown) => {
      console.error('[asis] selectionOverlay prewarm load failed', err);
    });

    const removeReadyListener = onceRendererReady(win, () => {
      if (this.prewarmed !== win) return;
      this.prewarmedReady = true;
      // [perf] 콜드스타트 진단 — prewarm 완료까지 걸린 시간을 prod 로그에도 남긴다.
      log.info(`[perf] selectionOverlay prewarm ready +${String(Date.now() - startedAt)}ms`);
    });

    win.once('closed', () => {
      // ready 미수신 상태로 닫힌 경우 리스너 잔존 방지 (수신 후엔 no-op).
      removeReadyListener();
      if (this.prewarmed !== win) return;
      this.prewarmed = null;
      this.prewarmedReady = false;
      if (!this.stopped) setImmediate(() => this.prewarm());
    });

    // overlay 가 이미 떠 있으면(재-prewarm 경로) windows 폴링이 갱신 중이므로
    // 중복 FFI 호출을 생략한다.
    if (!this.win) {
      this.refreshWindowsCache().catch((err: unknown) => {
        console.warn('[asis] selectionOverlay refreshWindowsCache 실패:', err);
      });
    }
  }

  /** 영역 선택 오버레이가 떠 있는지 — 녹화 시작 전 "준비 중" 판정에 쓴다. */
  isSelecting(): boolean {
    return this.win !== null;
  }

  show(): Promise<SelectionResult> {
    if (this.win) {
      // 이미 떠 있으면 focus 후 silent canceled 반환 — 중복 캡처 방지.
      // null-safety: 의도된 옵셔널 흐름 (사용자가 단축키 두 번 누른 경우).
      this.win.focus();
      return Promise.resolve({ kind: 'canceled' });
    }

    // UI 자동 감지 — 오버레이 자체가 CGWindowList 에 포함되기 전에 권한 확인.
    promptAccessibilityIfMissing(tMain().accessibility.selectionBody);

    const display = getCursorDisplay();
    const shownAt = Date.now();
    const { win, path } = this.acquireWindow(display);
    log.info(`[perf] selectionOverlay show (${path})`);
    this.win = win;
    logDidFailLoad(win, 'selectionOverlay');

    // 커서 모니터 창 = 세션의 기준 창. 다른 모니터 창은 아래에서 뒤늦게 합류한다.
    const primary: Overlay = { win, display, ready: path === 'prewarmed-ready' };
    const session = new Session(primary);
    this.overlays = session.overlays;

    // background 캡처를 표시보다 먼저 시작 — CG 캡처는 .async 디스패치 후 ~1ms 내
    // worker 에서 프레임을 잡고, 아래 opacity/show 커밋은 다음 컴포지터 프레임에
    // 반영되므로 캡처에 오버레이 dim 이 찍히지 않는다.
    const primarySnapshot = sendBackgroundSnapshot(win, display, true).then(() => {
      log.info(`[perf] selectionOverlay background 캡처 완료 +${String(Date.now() - shownAt)}ms`);
    }).catch((err: unknown) => {
      console.warn('[asis] background 캡처 실패 (color picker 비활성):', err);
    });

    revealWindow(win, path);
    // stopped/중복 체크는 prewarm() 내부에서 수행하므로 타이머 정리는 불필요.
    setTimeout(() => this.prewarm(), REPREWARM_DELAY_MS);
    refocusOnReadyToShow(win);

    const feed = this.startWindowsFeed(session);
    if (primary.ready) {
      // 가장 빠른 경로: 캐시된 목록을 즉시 전송.
      feed.sendCachedTo(primary);
    } else {
      session.unsubscribes.push(onceRendererReady(win, () => {
        log.info(`[perf] selectionOverlay renderer ready +${String(Date.now() - shownAt)}ms (${path})`);
        primary.ready = true;
        feed.sendCachedTo(primary);
      }));
    }
    session.unsubscribes.push(startBackgroundPolling(win, display, 'selectionOverlay'));

    // 다른 모니터 창 — 동기 BrowserWindow 생성이 커서 모니터의 bg 캡처 완료 콜백
    // (magnifier 등장)을 밀어내지 않도록 그 캡처가 끝난 뒤에 만든다.
    primarySnapshot.finally(() => {
      if (session.settled) return;
      for (const other of getAllDisplayRefs()) {
        if (other.id !== display.id) this.addSecondaryOverlay(session, other, feed);
      }
    }).catch((err: unknown) => {
      console.error('[asis] selectionOverlay 보조 모니터 창 생성 실패:', err);
    });

    return this.waitForSelection(session);
  }

  stop(): void {
    this.stopped = true;
    if (this.prewarmed && !this.prewarmed.isDestroyed()) {
      this.prewarmed.close();
    }
    this.prewarmed = null;
    for (const { win } of this.overlays) {
      if (!win.isDestroyed()) win.close();
    }
    this.overlays = [];
    this.win = null;
  }

  /**
   * 커서가 없는 모니터의 오버레이. prewarm 이 없는 cold 창이라 renderer 로드 전에
   * 보낸 background 스냅샷은 유실된다 — 그래서 opacity 0 + 클릭 통과로 order-in 만
   * 해 두고, renderer ready 시점에 스냅샷 시작 → 표시한다 (기준 창과 같은 순서).
   * focus 는 주지 않는다 — 키 입력은 커서 모니터 창이 받는다.
   */
  private addSecondaryOverlay(session: Session, display: DisplayRef, feed: WindowsFeed): void {
    const win = createOverlayWindow(display.bounds);
    const overlay: Overlay = { win, display, ready: false };
    session.overlays.push(overlay);
    logDidFailLoad(win, 'selectionOverlay');
    win.setIgnoreMouseEvents(true);
    win.setOpacity(0);
    win.showInactive();
    loadRendererPage(win, 'selection').catch((err: unknown) => {
      console.error('[asis] selectionOverlay secondary load failed', err);
    });
    session.unsubscribes.push(onceRendererReady(win, () => {
      if (session.settled || win.isDestroyed()) return;
      sendBackgroundSnapshot(win, display).catch((err: unknown) => {
        console.warn('[asis] 보조 모니터 background 캡처 실패 (color picker 비활성):', err);
      });
      win.setIgnoreMouseEvents(false);
      win.setOpacity(1);
      overlay.ready = true;
      feed.sendCachedTo(overlay);
    }));
    session.unsubscribes.push(startBackgroundPolling(win, display, 'selectionOverlay'));
    // 어느 모니터 창이든 닫히면 세션 취소 — waitForSelection 이 등록한 settle 로 연결.
    win.on('closed', () => session.cancel());
  }

  /** prewarm 된 standby 창을 꺼내 쓰고, 없으면(prewarm 완료 전 단축키) 새로 만든다. */
  private acquireWindow(display: DisplayRef): AcquiredWindow {
    const standby = this.prewarmed;
    if (!standby) {
      const win = createOverlayWindow(display.bounds);
      loadRendererPage(win, 'selection').catch((err: unknown) => {
        console.error('[asis] selectionOverlay load failed', err);
      });
      return { win, path: 'cold' };
    }
    const path: ShowPath = this.prewarmedReady ? 'prewarmed-ready' : 'prewarmed-loading';
    this.prewarmed = null;
    this.prewarmedReady = false;
    // prewarm 시점과 다른 디스플레이일 수 있으므로 bounds 갱신.
    standby.setBounds(display.bounds);
    return { win: standby, path };
  }

  /** windows 목록 캐시와 Dock 아이콘 캐시를 함께 갱신하고 새 목록을 반환한다. */
  private async refreshWindowsCache(): Promise<WindowInfo[]> {
    const windows = await listWindows();
    this.cachedWindows = windows;
    // listWindows 가 Dock PID 를 기록한 직후가 getDockItems 호출 적기.
    this.cachedDock = getDockItems() ?? [];
    return windows;
  }

  /**
   * 모든 모니터 창에 windows 목록(+ Dock 아이콘)을 각 창의 로컬 좌표로 보낸다.
   *   1) 캐시본 — 각 창의 renderer ready 시점에 (sendCachedTo)
   *   2) fresh 조회 — FRESH_WINDOWS_DELAY_MS 뒤
   *   3) 폴링·Space 전환 — overlay 가 떠 있는 동안 계속. 사용자가 trackpad 로
   *      Space 를 전환해도 새 화면의 UI 가 감지되도록.
   * listWindows FFI 는 창 수와 무관하게 한 번만 돈다. 생존 판정은 기준 창 —
   * 어느 창이 닫혀도 세션이 끝나므로 기준 창만 보면 충분하다.
   */
  private startWindowsFeed(session: Session): WindowsFeed {
    const anchor = session.overlays[0].win;
    // 전역 스크린 좌표 → 각 창의 로컬 좌표. 다중 디스플레이에서 왼쪽/위 디스플레이의
    // 창이 음수 좌표로 오면 renderer pointer(로컬)와 불일치하는 버그를 막는다.
    const sendTo = (overlay: Overlay, windows: WindowInfo[]): void => {
      if (!overlay.ready || overlay.win.isDestroyed()) return;
      const { x: minX, y: minY } = overlay.display.bounds;
      overlay.win.webContents.send(
        CHANNEL_WINDOWS,
        [...windows, ...this.cachedDock].map((w) => ({ ...w, x: w.x - minX, y: w.y - minY })),
      );
    };
    const sendAll = (windows: WindowInfo[]): void => {
      for (const overlay of session.overlays) sendTo(overlay, windows);
    };
    const refreshAndSend = (): Promise<void> => this.refreshWindowsCache().then(sendAll);
    const refreshIfAlive = (): void => {
      if (anchor.isDestroyed()) return;
      refreshAndSend().catch(() => { /* 폴링이 다음 tick 에서 복구 */ });
    };

    setTimeout(() => {
      if (anchor.isDestroyed()) return;
      refreshAndSend().catch((err: unknown) => {
        console.warn('[asis] selectionOverlay listWindows 실패:', err);
      });
    }, FRESH_WINDOWS_DELAY_MS);

    session.unsubscribes.push(startWindowInterval(anchor, WINDOWS_POLL_MS, refreshIfAlive));
    // Space 전환 이벤트 — 폴링보다 빠르게 새 Space UI 를 감지한다.
    session.unsubscribes.push(onSpaceChange(() => {
      if (anchor.isDestroyed()) return;
      refreshIfAlive();
      setTimeout(refreshIfAlive, SPACE_SETTLE_DELAY_MS);
      // background 도 같이 — Space 전환 직후 magnifier 픽셀 stale 방지.
      setTimeout(() => {
        for (const { win, display, ready } of session.overlays) {
          if (!ready || win.isDestroyed()) continue;
          sendBackgroundSnapshot(win, display).catch(() => { /* background 폴링이 복구 */ });
        }
      }, SPACE_SETTLE_DELAY_MS);
    }));

    return {
      sendCachedTo: (overlay) => {
        if (this.cachedWindows) sendTo(overlay, this.cachedWindows);
      },
    };
  }

  /**
   * 어느 모니터 창에서든 영역 선택·취소·창 닫힘 중 먼저 온 것으로 settle 한다.
   * settle 은 한 번만 — 모든 구독을 해제하고 모든 모니터 창을 닫는다.
   */
  private waitForSelection(session: Session): Promise<SelectionResult> {
    const findOverlay = (event: IpcMainEvent | IpcMainInvokeEvent): Overlay | undefined =>
      session.overlays.find(({ win }) => !win.isDestroyed() && event.sender === win.webContents);
    // element-at 는 전역 핸들러 + provider 교체 (common.ts). sender 창의 origin 으로 변환.
    const elementAtProvider = createMultiLocalElementAtProvider(() =>
      session.overlays.map(({ win, display }) => ({ win, origin: display.bounds })));
    setElementAtProvider(elementAtProvider);

    return new Promise<SelectionResult>((resolve) => {
      const settle = (result: SelectionResult): void => {
        if (!session.markSettled()) return;
        ipcMain.removeHandler(CHANNEL_REGION);
        clearElementAtProvider(elementAtProvider);
        // 이 세션 리스너만 — removeAllListeners 는 다른 창의 리스너까지 지운다.
        ipcMain.removeListener(CHANNEL_CANCEL, onCancel);
        esc.release();
        for (const unsubscribe of session.unsubscribes) unsubscribe();
        this.win = null;
        this.overlays = [];
        for (const { win } of session.overlays) {
          if (!win.isDestroyed()) win.close();
        }
        resolve(result);
      };
      const cancel = (): void => settle({ kind: 'canceled' });
      session.bindCancel(cancel);

      // macOS 26β 에서 transparent+alwaysOnTop 창이 keydown 을 못 받는 회귀 우회용 전역 ESC.
      // 녹화 중이면 ESC 는 이미 녹화 쪽이 쥐고 있어 점유에 실패한다 — claimEsc 는 그때 해제도
      // 하지 않으므로 녹화의 ESC(취소 경로)가 지워지지 않는다.
      const esc = claimEsc(cancel);
      if (!esc.owned) {
        console.warn('[asis] selectionOverlay: ESC globalShortcut 등록 실패 — renderer keydown 만 의지');
      }
      // handleOnce 대신 sender 확인 — standby·종료 직후 창의 잔여 invoke 가 핸들러를 소모하지 않게.
      ipcMain.handle(CHANNEL_REGION, (event, rect: Rect) => {
        const overlay = findOverlay(event);
        if (!overlay) return;
        const local = rect.windowId === undefined
          ? clampToDisplay(rect, overlay.display.bounds)
          : rect;
        if (!local) {
          // 모니터 밖으로만 그린 퇴화 rect — renderer 는 이미 선택을 끝냈으므로 세션을 닫는다.
          cancel();
          return;
        }
        const { x: minX, y: minY } = overlay.display.bounds;
        settle({ kind: 'selected', rect: { ...local, x: local.x + minX, y: local.y + minY } });
      });
      const onCancel = (event: IpcMainEvent): void => {
        if (findOverlay(event)) cancel();
      };
      ipcMain.on(CHANNEL_CANCEL, onCancel);
      session.overlays[0].win.on('closed', cancel);
    });
  }
}

/**
 * 오버레이 표시 — standby 는 이미 order-in 상태라 opacity 복원(컴포지터 속성
 * 변경 1프레임)만으로 즉시 뜬다. cold 폴백만 일반 show() 경로.
 */
function revealWindow(win: BrowserWindow, path: ShowPath): void {
  if (path === 'cold') {
    win.show();
  } else {
    win.setIgnoreMouseEvents(false);
    win.setOpacity(1);
  }
  win.focus();
  win.webContents.focus();
}
