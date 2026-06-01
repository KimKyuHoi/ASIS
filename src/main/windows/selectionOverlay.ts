import { BrowserWindow, globalShortcut, ipcMain, Notification, screen } from 'electron';
import { is } from '@electron-toolkit/utils';
import { preloadPath } from './common';
import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureAccessibilityPermission,
  getDockItems,
  getElementBoundsAtPoint,
  listWindows,
  onSpaceChange,
} from '../windowsInfo';
import type { WindowInfo } from '../windowsInfo';

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
const CHANNEL_BACKGROUND = 'capture:background';
const CHANNEL_WINDOWS = 'capture:windows';
const CHANNEL_READY = 'capture:ready';
const CHANNEL_ELEMENT_AT = 'capture:element-at';

/**
 * 영역 선택 오버레이 — 풀스크린 transparent BrowserWindow lifecycle 관리.
 *
 * 빠른 실행을 위한 두 가지 최적화:
 *
 * 1. prewarm() — 앱 시작 시 BrowserWindow + HTML 로드를 미리 수행.
 *    show() 에서는 setBounds + win.show() 만 하면 된다.
 *
 * 2. windows 목록 캐시 — listWindows() 는 koffi FFI 동기 블로킹 호출.
 *    prewarm() 과 사용 후 백그라운드에서 미리 갱신해 두고,
 *    show() 에서는 캐시를 즉시 전송한다.
 *
 * show() 의 임계 경로:
 *   setBounds → captureBackgroundForOverlay 시작 → win.show() → 캐시된 windows 전송
 *   → listWindows 백그라운드 갱신 (비차단)
 */
export class SelectionOverlayManager {
  private win: BrowserWindow | null = null;
  private prewarmed: BrowserWindow | null = null;
  /** prewarm 된 renderer 가 capture:ready 를 이미 보냈는지 추적. */
  private prewarmedReady = false;
  /** listWindows() 결과 캐시 — show() 에서 즉시 전송용. */
  private cachedWindows: WindowInfo[] | null = null;
  private stopped = false;

  /**
   * 앱 시작 시 호출 — BrowserWindow 생성 + HTML 로드 + windows 목록 캐시를
   * 백그라운드에서 미리 수행한다. show() 호출 시 즉시 띄울 수 있도록 warm-up.
   */
  prewarm(): void {
    if (this.stopped || this.prewarmed) return;

    const win = createOverlayWindow();
    this.prewarmed = win;
    this.prewarmedReady = false;

    const overlayPath = join(__dirname, '../renderer/selection/index.html');
    win.loadFile(overlayPath).catch((err: unknown) => {
      console.error('[asis] selectionOverlay prewarm loadFile failed', err);
    });

    ipcMain.once(CHANNEL_READY, () => {
      if (this.prewarmed === win) {
        this.prewarmedReady = true;
        if (is.dev) console.info('[asis] selectionOverlay: prewarm ready');
      }
    });

    win.once('closed', () => {
      if (this.prewarmed === win) {
        this.prewarmed = null;
        this.prewarmedReady = false;
        if (!this.stopped) {
          setImmediate(() => this.prewarm());
        }
      }
    });

    // windows 목록을 백그라운드에서 미리 캐싱 — show() 에서 즉시 사용.
    this._refreshWindowsCache();
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
        title: 'ASIS — 손쉬운 사용 권한 필요',
        body: '시스템 설정에서 ASIS를 허용한 후 앱을 재시작하면 UI 자동감지가 활성화됩니다.',
      }).show();
    }

    // 커서가 있는 디스플레이만 덮는다.
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const minX = display.bounds.x;
    const minY = display.bounds.y;
    const totalWidth = display.bounds.width;
    const totalHeight = display.bounds.height;

    let win: BrowserWindow;
    let skipReadyWait: boolean;

    if (this.prewarmed) {
      win = this.prewarmed;
      skipReadyWait = this.prewarmedReady;
      this.prewarmed = null;
      this.prewarmedReady = false;
      // pre-warm 시점과 다른 디스플레이일 수 있으므로 bounds 갱신.
      win.setBounds({ x: minX, y: minY, width: totalWidth, height: totalHeight });
    } else {
      // pre-warm 이 완료되기 전에 단축키를 눌렀을 때 폴백 경로.
      win = createOverlayWindow();
      skipReadyWait = false;
      const overlayPath = join(__dirname, '../renderer/selection/index.html');
      if (is.dev) console.info(`[asis] selectionOverlay loadFile (cold): ${overlayPath}`);
      win.loadFile(overlayPath).catch((err: unknown) => {
        console.error('[asis] selectionOverlay loadFile failed', err);
      });
    }

    this.win = win;

    // 사용 시작과 동시에 다음 회차 pre-warm 시작.
    this.prewarm();

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(
        `[asis] selectionOverlay did-fail-load code=${code} desc=${desc} url=${url}`,
      );
    });

    // background 캡처를 win.show() 보다 먼저 시작 — screencapture 프로세스가 시작된 후
    // 윈도우가 뜨므로 캡처 시점에 오버레이 overlay dim 이 찍히지 않는다.
    captureBackgroundForOverlay(win).catch((err: unknown) => {
      console.warn('[asis] background 캡처 실패 (color picker 비활성):', err);
    });

    // 오버레이를 즉시 표시 — windows 목록 조회는 show() 이후 비차단으로 처리.
    win.show();
    win.focus();
    win.webContents.focus();

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
        // Dock 아이콘들도 함께 — listWindows 에서 Dock 차단했지만 AX 로 개별
        // 아이콘만 추출. listWindows 가 부수적으로 캐시한 _lastDockPid 가 있을
        // 때만 동작 (없으면 빈 배열).
        const dock = getDockItems() ?? [];
        win.webContents.send(CHANNEL_WINDOWS, [...windows, ...dock].map(toLocal));
      }
    };

    if (skipReadyWait && this.cachedWindows) {
      // 가장 빠른 경로: 캐시된 목록을 즉시 전송.
      sendWindows(this.cachedWindows);
    } else {
      // renderer ready 를 기다린 뒤 전송.
      const readyPromise: Promise<void> = skipReadyWait
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
          ipcMain.once(CHANNEL_READY, () => resolve());
        });
      readyPromise.then(() => {
        if (this.cachedWindows) sendWindows(this.cachedWindows);
      }).catch((err: unknown) => {
        console.warn('[asis] selectionOverlay ready wait 실패:', err);
      });
    }

    // 백그라운드에서 fresh windows 조회 → 갱신 전송.
    // listWindows() 의 동기 FFI 블로킹이 win.show() 를 막지 않도록 setImmediate 로 지연.
    setImmediate(() => {
      listWindows().then((windows) => {
        this.cachedWindows = windows;
        sendWindows(windows);
      }).catch((err: unknown) => {
        console.warn('[asis] selectionOverlay listWindows 실패:', err);
      });
    });

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
          sendWindows(updated);
        }).catch(() => { /* polling 이 다음 tick 에서 복구 */ });
      };
      refresh();
      setTimeout(refresh, 350);
      // background 도 같이 — Space 전환 직후 magnifier 픽셀 stale 방지.
      setTimeout(() => {
        if (win.isDestroyed()) return;
        captureBackgroundForOverlay(win).catch(() => { /* bgPoll 이 복구 */ });
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
      captureBackgroundForOverlay(win)
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
    return new Promise<SelectionResult>((resolve) => {
      let settled = false;
      const settle = (result: SelectionResult): void => {
        if (settled) return;
        settled = true;
        ipcMain.removeHandler(CHANNEL_REGION);
        ipcMain.removeHandler(CHANNEL_ELEMENT_AT);
        ipcMain.removeAllListeners(CHANNEL_CANCEL);
        ipcMain.removeAllListeners(CHANNEL_READY);
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

      ipcMain.handle(CHANNEL_ELEMENT_AT, (_event, x: number, y: number) => {
        const result = getElementBoundsAtPoint(x + minX, y + minY);
        if (!result) return null;
        return {
          x: result.x - minX,
          y: result.y - minY,
          w: result.w,
          h: result.h,
          name: result.name,
        };
      });

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

  /** windows 목록 캐시를 백그라운드에서 갱신. */
  private _refreshWindowsCache(): void {
    listWindows().then((windows) => {
      this.cachedWindows = windows;
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

/**
 * Color picker / Magnifier 용 background 캡처.
 *
 * overlay 가 *띄워지기 전* 시점의 화면을 screencapture 로 잡고, dataURL 로
 * renderer 에 전송. overlay 가 mount 후 그걸 받아 픽셀 read 에 사용.
 */
async function captureBackgroundForOverlay(
  win: BrowserWindow,
): Promise<void> {
  const tmpPath = join(
    tmpdir(),
    `asis-bg-${Date.now()}-${process.pid}.png`,
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('/usr/sbin/screencapture', [
        '-x',
        '-t',
        'png',
        tmpPath,
      ]);
      // screencapture 가 hang 하는 극단 케이스(드물지만 시스템 freeze 등)
      // 에서 process leak 방지. 5초 timeout 충분 (일반 캡처 100-300ms).
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('screencapture timeout (5s)'));
      }, 5000);
      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`screencapture exit ${code}`));
      });
    });
    const buf = await readFile(tmpPath);
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    if (!win.isDestroyed()) {
      win.webContents.send(CHANNEL_BACKGROUND, dataUrl);
    }
  } finally {
    // screencapture 실패 시에도 부분 생성된 PNG 가 남을 수 있어 finally 에서 정리.
    // ENOENT 는 정상 (실패 시 파일 자체가 안 생긴 경우).
    await unlink(tmpPath).catch((err: unknown) => {
      if (!isFileNotFound(err)) console.warn('[asis] background tmp cleanup failed', err);
    });
  }
}

function isFileNotFound(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
