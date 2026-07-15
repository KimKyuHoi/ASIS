import { BrowserWindow, globalShortcut, ipcMain, Notification, screen } from 'electron';
import type { IpcMainEvent } from 'electron';
import log from 'electron-log/main';
import {
  clearElementAtProvider,
  loadRendererPage,
  preloadPath,
  setElementAtProvider,
} from './common';
import type { ElementAtProvider } from './common';
import { sendBackgroundSnapshot } from '../capture/displaySnapshot';
import {
  ensureAccessibilityPermission,
  getDockItems,
  getElementBoundsAtPoint,
  listWindows,
  onSpaceChange,
} from '../windowsInfo';
import type { WindowInfo } from '../windowsInfo';
import { tMain } from '../i18n/strings';

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  windowId?: number;
};

export type SelectionResult =
  | { kind: 'selected'; rect: Rect } |
  { kind: 'canceled' };

const CHANNEL_REGION = 'capture:region';
const CHANNEL_CANCEL = 'capture:cancel';
const CHANNEL_WINDOWS = 'capture:windows';
const CHANNEL_READY = 'capture:ready';

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
 */
export class SelectionOverlayManager {
  private win: BrowserWindow | null = null;
  private prewarmed: BrowserWindow | null = null;
  /** prewarm 된 renderer 가 capture:ready 를 이미 보냈는지 추적. */
  private prewarmedReady = false;
  /** listWindows() 결과 캐시 — show() 에서 즉시 전송용. */
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
    const win = createOverlayWindow();
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

    loadRendererPage(win, 'selection').catch((err: unknown) => {
      console.error('[asis] selectionOverlay prewarm load failed', err);
    });

    // ready 는 *이 prewarm 창의 sender 로만* 판정한다. 채널 전역 once() 를 쓰면
    //   (a) 현재 세션 오버레이의 ready 를 prewarm ready 로 오인하고,
    //   (b) 세션 settle 이 지우면 실제 로드 완료가 영영 기록되지 않아
    //       다음 show 가 prewarmed-loading 경로로 빠진다 (실측 +438ms 지연).
    const onReady = (event: IpcMainEvent): void => {
      if (event.sender !== win.webContents) return;
      ipcMain.removeListener(CHANNEL_READY, onReady);
      if (this.prewarmed === win) {
        this.prewarmedReady = true;
        // [perf] 콜드스타트 진단 — prewarm 완료까지 걸린 시간을 prod 로그에도 남긴다.
        log.info(`[perf] selectionOverlay prewarm ready +${Date.now() - startedAt}ms`);
      }
    };
    ipcMain.on(CHANNEL_READY, onReady);

    win.once('closed', () => {
      // ready 미수신 상태로 닫힌 경우 리스너 잔존 방지 (수신 후엔 no-op).
      ipcMain.removeListener(CHANNEL_READY, onReady);
      if (this.prewarmed === win) {
        this.prewarmed = null;
        this.prewarmedReady = false;
        if (!this.stopped) {
          setImmediate(() => this.prewarm());
        }
      }
    });

    // windows 목록을 백그라운드에서 미리 캐싱 — show() 에서 즉시 사용.
    // overlay 가 이미 떠 있으면(재-prewarm 경로) windowsPoll 이 400ms 마다
    // 갱신 중이므로 중복 FFI 호출을 생략한다.
    if (!this.win) this._refreshWindowsCache();
  }

  show(): Promise<SelectionResult> {
    if (this.win) {
      // 이미 떠 있으면 focus 후 silent canceled 반환 — 중복 캡처 방지.
      // null-safety: 의도된 옵셔널 흐름 (사용자가 단축키 두 번 누른 경우).
      this.win.focus();
      return Promise.resolve({ kind: 'canceled' });
    }

    // UI 자동 감지 — 오버레이 자체가 CGWindowList 에 포함되기 전에 권한 확인.
    if (!ensureAccessibilityPermission(false)) {
      ensureAccessibilityPermission(true);
      new Notification({
        title: tMain().accessibility.title,
        body: tMain().accessibility.selectionBody,
      }).show();
    }

    // 커서가 있는 디스플레이만 덮는다.
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const minX = display.bounds.x;
    const minY = display.bounds.y;
    const totalWidth = display.bounds.width;
    const totalHeight = display.bounds.height;

    const shownAt = Date.now();
    // [perf] 어떤 경로로 오버레이가 떴는지 — 첫 실행 콜드스타트 진단용.
    const perfPath = this.prewarmed
      ? (this.prewarmedReady ? 'prewarmed-ready' : 'prewarmed-loading')
      : 'cold';
    log.info(`[perf] selectionOverlay show (${perfPath})`);

    let win: BrowserWindow;
    let skipReadyWait: boolean;
    /** prewarm 의 invisible standby 에서 온 창인지 — 표시 방법이 갈린다. */
    let fromStandby: boolean;

    if (this.prewarmed) {
      win = this.prewarmed;
      skipReadyWait = this.prewarmedReady;
      fromStandby = true;
      this.prewarmed = null;
      this.prewarmedReady = false;
      // pre-warm 시점과 다른 디스플레이일 수 있으므로 bounds 갱신.
      win.setBounds({ x: minX, y: minY, width: totalWidth, height: totalHeight });
    } else {
      // pre-warm 이 완료되기 전에 단축키를 눌렀을 때 폴백 경로.
      win = createOverlayWindow();
      skipReadyWait = false;
      fromStandby = false;
      loadRendererPage(win, 'selection').catch((err: unknown) => {
        console.error('[asis] selectionOverlay load failed', err);
      });
    }

    this.win = win;

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(
        `[asis] selectionOverlay did-fail-load code=${code} desc=${desc} url=${url}`,
      );
    });

    // background 캡처를 표시보다 먼저 시작 — CG 캡처는 .async 디스패치 후 ~1ms 내
    // worker 에서 프레임을 잡고, 아래 opacity/show 커밋은 다음 컴포지터 프레임에
    // 반영되므로 캡처에 오버레이 dim 이 찍히지 않는다.
    const displayRef = {
      id: display.id,
      bounds: { x: minX, y: minY, width: totalWidth, height: totalHeight },
    };
    sendBackgroundSnapshot(win, displayRef, true).then(() => {
      log.info(`[perf] selectionOverlay background 캡처 완료 +${Date.now() - shownAt}ms`);
    }).catch((err: unknown) => {
      console.warn('[asis] background 캡처 실패 (color picker 비활성):', err);
    });

    // 오버레이 표시 — standby 는 이미 order-in 상태라 opacity 복원(컴포지터 속성
    // 변경 1프레임)만으로 즉시 뜬다. cold 폴백만 일반 show() 경로.
    if (fromStandby) {
      win.setIgnoreMouseEvents(false);
      win.setOpacity(1);
      win.focus();
    } else {
      win.show();
      win.focus();
    }
    win.webContents.focus();

    // 다음 회차 pre-warm — BrowserWindow 동기 생성이 bg 캡처 완료 콜백보다 먼저
    // main thread 를 점유하지 않도록 캡처가 끝난 뒤(~300ms)로 미룬다. overlay 가
    // 떠 있는 동안엔 재-트리거가 불가능해 이 지연은 체감되지 않는다.
    // stopped/중복 체크는 prewarm() 내부에서 수행하므로 타이머 정리는 불필요.
    const REPREWARM_DELAY_MS = 300;
    setTimeout(() => this.prewarm(), REPREWARM_DELAY_MS);

    // macOS 26β 에서 transparent+alwaysOnTop 윈도우가 자동 focus 못 받는 회귀.
    win.once('ready-to-show', () => {
      win.focus();
      win.webContents.focus();
    });

    // windows 목록 전송 전략:
    //   - 캐시 있음 + renderer ready → 즉시 전송 (0ms 지연)
    //   - 캐시 없음 or renderer not ready → ready 대기 후 전송
    // 전송 이후 백그라운드에서 fresh 조회 → 갱신 전송 (windoslist 변동 반영).
    // 전역 스크린 좌표 → 오버레이 로컬 좌표 변환.
    // CHANNEL_ELEMENT_AT 가 이미 minX/minY 를 빼듯, windows 도 동일하게 보정한다.
    // 다중 디스플레이에서 왼쪽/위 디스플레이의 창이 음수 좌표로 오면
    // 렌더러 pointer(로컬)와 비교할 때 완전히 불일치하는 버그를 방지.
    const toLocal = (w: WindowInfo): WindowInfo => ({
      ...w,
      x: w.x - minX,
      y: w.y - minY,
    });

    const sendWindows = (windows: WindowInfo[]): void => {
      if (!win.isDestroyed()) {
        // Dock 아이콘들도 함께 — 단, 매 전송마다 AX IPC(getDockItems)를 돌면
        // show 직후 main thread 를 점유해 bg 캡처 완료 콜백을 밀어내므로
        // listWindows 갱신 시점에 함께 캐시해 둔 값을 쓴다.
        win.webContents.send(
          CHANNEL_WINDOWS,
          [...windows, ...this.cachedDock].map(toLocal),
        );
      }
    };

    // 이 세션 창의 ready 리스너 해제 함수 — settle 에서 정확히 이것만 지운다.
    // removeAllListeners(CHANNEL_READY) 를 쓰면 재-prewarm 의 ready 리스너까지
    // 지워져 다음 show 가 prewarmed-loading 으로 오판된다.
    let removeShowReadyListener: (() => void) | null = null;

    if (skipReadyWait && this.cachedWindows) {
      // 가장 빠른 경로: 캐시된 목록을 즉시 전송.
      sendWindows(this.cachedWindows);
    } else {
      // renderer ready 를 기다린 뒤 전송 — *이 창의 sender* 로만 판정
      // (prewarm 창의 ready 가 먼저 와도 오인하지 않도록).
      const readyPromise: Promise<void> = skipReadyWait
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
          const onReady = (event: IpcMainEvent): void => {
            if (event.sender !== win.webContents) return;
            ipcMain.removeListener(CHANNEL_READY, onReady);
            resolve();
          };
          ipcMain.on(CHANNEL_READY, onReady);
          removeShowReadyListener = () => ipcMain.removeListener(CHANNEL_READY, onReady);
        });
      readyPromise.then(() => {
        log.info(`[perf] selectionOverlay renderer ready +${Date.now() - shownAt}ms (${perfPath})`);
        if (this.cachedWindows) sendWindows(this.cachedWindows);
      }).catch((err: unknown) => {
        console.warn('[asis] selectionOverlay ready wait 실패:', err);
      });
    }

    // 백그라운드에서 fresh windows 조회 → 갱신 전송.
    // listWindows() 의 동기 FFI 가 bg 캡처 파이프라인(child close → readFile →
    // send)의 콜백을 밀어내 magnifier 등장이 늦어지지 않도록, 캡처가 보통 끝나는
    // 시점(~150ms) 이후로 지연한다. 그동안 스냅 UI 는 위의 캐시본으로 동작한다.
    const FRESH_WINDOWS_DELAY_MS = 150;
    setTimeout(() => {
      if (win.isDestroyed()) return;
      listWindows().then((windows) => {
        this.cachedWindows = windows;
        this.cachedDock = getDockItems() ?? [];
        sendWindows(windows);
      }).catch((err: unknown) => {
        console.warn('[asis] selectionOverlay listWindows 실패:', err);
      });
    }, FRESH_WINDOWS_DELAY_MS);

    // 공간 전환 지속 감지 — overlay 가 떠 있는 동안 windows 목록과 background
    // 화면을 주기적으로 갱신해서 사용자가 trackpad 로 Space 를 전환해도 새 화면의
    // UI 가 감지되도록 한다.
    // - WINDOWS_POLL_MS 400: koffi 동기 호출 cost 가 낮아서 빠르게 폴링 가능
    // - BG_POLL_MS 2500: screencapture spawn + PNG IO 비용이 커서 보수적으로
    //   설정. Space 전환 후 magnifier 픽셀이 최악 2.5s 지연 갱신 (수용 가능).
    const WINDOWS_POLL_MS = 400;
    const BG_POLL_MS = 2500;

    const windowsPoll = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(windowsPoll);
        return;
      }
      listWindows().then((updated) => {
        this.cachedWindows = updated;
        this.cachedDock = getDockItems() ?? [];
        sendWindows(updated);
      }).catch(() => { /* 다음 tick 에서 재시도 */ });
    }, WINDOWS_POLL_MS);

    // Space 전환 이벤트 구독 — polling 보다 빠르게 새 Space UI 감지.
    // 폴링은 fallback 으로 그대로 유지 (이 이벤트가 fire 안 하는 환경 대응).
    // Space 전환 애니메이션(~300ms) 직후에 listWindows 가 새 Space 의 창을
    // 반환하므로 350ms delay 추가 호출도 한다.
    const unsubSpaceChange = onSpaceChange(() => {
      if (win.isDestroyed()) return;
      const refresh = (): void => {
        if (win.isDestroyed()) return;
        listWindows().then((updated) => {
          this.cachedWindows = updated;
          this.cachedDock = getDockItems() ?? [];
          sendWindows(updated);
        }).catch(() => { /* polling 이 다음 tick 에서 복구 */ });
      };
      refresh();
      setTimeout(refresh, 350);
      // background 도 같이 — Space 전환 직후 magnifier 픽셀 stale 방지.
      setTimeout(() => {
        if (win.isDestroyed()) return;
        sendBackgroundSnapshot(win, displayRef).catch(() => { /* bgPoll 이 복구 */ });
      }, 350);
    });

    // in-flight flag — 이전 screencapture spawn 미완료 시 다음 tick skip.
    // 캡처가 BG_POLL_MS 보다 오래 걸리는 케이스(시스템 부하 등) 에서 중복 spawn
    // 으로 IO·CPU 가 누적되는 것을 방지.
    // 영구 실패 시 noisy 한 반복 로그를 피하려고 첫 실패만 한 번 기록한다.
    let bgCaptureInFlight = false;
    let bgPollFailureLogged = false;
    const bgPoll = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(bgPoll);
        return;
      }
      if (bgCaptureInFlight) return;
      bgCaptureInFlight = true;
      sendBackgroundSnapshot(win, displayRef)
        .catch((err: unknown) => {
          if (!bgPollFailureLogged) {
            console.warn('[asis] background polling 실패 (이후 silent):', err);
            bgPollFailureLogged = true;
          }
        })
        .finally(() => { bgCaptureInFlight = false; });
    }, BG_POLL_MS);

    // macOS 26β 에서 transparent+alwaysOnTop 윈도우가 keydown 을 못 받는 회귀 우회.
    const ESC_ACCEL = 'Escape';

    // element-at 는 전역 핸들러 + provider 교체 (common.ts) — 이 세션 창의
    // invoke 만 응답하고, standby/종료 직후 잔여 invoke 는 null 로 조용히 처리.
    const elementAtProvider: ElementAtProvider = (event, x, y) => {
      if (event.sender !== win.webContents) return null;
      const result = getElementBoundsAtPoint(x + minX, y + minY);
      if (!result) return null;
      return {
        x: result.x - minX,
        y: result.y - minY,
        w: result.w,
        h: result.h,
        name: result.name,
      };
    };
    setElementAtProvider(elementAtProvider);

    return new Promise<SelectionResult>((resolve) => {
      let settled = false;
      const settle = (result: SelectionResult): void => {
        if (settled) return;
        settled = true;
        ipcMain.removeHandler(CHANNEL_REGION);
        clearElementAtProvider(elementAtProvider);
        ipcMain.removeAllListeners(CHANNEL_CANCEL);
        // 이 세션 창의 ready 리스너만 해제 — removeAllListeners 금지 (위 주석 참고).
        removeShowReadyListener?.();
        globalShortcut.unregister(ESC_ACCEL);
        clearInterval(windowsPoll);
        clearInterval(bgPoll);
        unsubSpaceChange();
        if (!win.isDestroyed()) {
          win.close();
        }
        this.win = null;
        resolve(result);
      };

      const escOk = globalShortcut.register(ESC_ACCEL, () => {
        settle({ kind: 'canceled' });
      });
      if (!escOk) {
        console.warn(
          '[asis] selectionOverlay: ESC globalShortcut 등록 실패 — renderer keydown 만 의지',
        );
      }

      ipcMain.handleOnce(CHANNEL_REGION, (_event, rect: Rect) => {
        settle({ kind: 'selected', rect: { ...rect, x: rect.x + minX, y: rect.y + minY } });
      });

      ipcMain.once(CHANNEL_CANCEL, () => {
        settle({ kind: 'canceled' });
      });

      win.on('closed', () => {
        this.win = null;
        settle({ kind: 'canceled' });
      });
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.prewarmed && !this.prewarmed.isDestroyed()) {
      this.prewarmed.close();
    }
    this.prewarmed = null;
    if (!this.win) return;
    if (!this.win.isDestroyed()) {
      this.win.close();
    }
    this.win = null;
  }

  /** windows 목록 캐시를 백그라운드에서 갱신. Dock 아이콘 캐시도 함께. */
  private _refreshWindowsCache(): void {
    listWindows().then((windows) => {
      this.cachedWindows = windows;
      // listWindows 가 _lastDockPid 를 캐시한 직후가 getDockItems 호출 적기.
      this.cachedDock = getDockItems() ?? [];
    }).catch((err: unknown) => {
      console.warn('[asis] selectionOverlay _refreshWindowsCache 실패:', err);
    });
  }
}

/**
 * 오버레이용 BrowserWindow 생성 헬퍼.
 * prewarm / cold-start 양쪽에서 동일한 옵션으로 생성한다.
 * show: false — 명시적 win.show() 전까지 숨김 (prewarm 상태 유지).
 */
function createOverlayWindow(): BrowserWindow {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.bounds;

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreenable: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    roundedCorners: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    // NSPanel(type:'panel') 은 macOS 의 floating window 표준 — fullscreen Space
    // (Slack/Opera 등) 위에도 그대로 떠서 Space 전환 없이 overlay 가 표시됨.
    // NSWindow(default) 와 달리 keyboard focus 도 받을 수 있도록 setVisibleOnAll
    // Workspaces + setAlwaysOnTop 조합으로 보강.
    type: 'panel',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  return win;
}

