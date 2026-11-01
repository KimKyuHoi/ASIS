import { BrowserWindow, ipcMain, Notification, screen, type IpcMainEvent } from 'electron';
import { configureFloatingWindow, preloadPath, type ElementAtProvider } from './common';
import { sendBackgroundSnapshot } from '../capture/displaySnapshot';
import { ensureAccessibilityPermission, getElementBoundsAtPoint } from '../windowsInfo';
import { tMain } from '../i18n/strings';

/**
 * 풀스크린 transparent 오버레이(영역 선택·화면 자)가 함께 쓰는 창 생성·구독 헬퍼.
 *
 * 구독을 시작하는 헬퍼는 모두 해제 함수를 반환한다 — 매니저는 그 함수들을 모아
 * 세션 종료 시 한 번에 호출한다.
 */

const CHANNEL_READY = 'capture:ready';

/**
 * Space 전환/화면 변화 시 magnifier 픽셀 갱신 주기. CG 캡처 + IPC 비용이 있어
 * 보수적으로 잡는다 — Space 전환 후 픽셀이 최악 2.5s 늦게 갱신된다 (수용 가능).
 */
const BACKGROUND_POLL_MS = 2500;

export type DisplayBounds = { x: number; y: number; width: number; height: number };
export type DisplayRef = { id: number; bounds: DisplayBounds };

/** 커서가 있는 디스플레이 — 화면 자·영역 선택의 즉시 표시 창이 덮는다. */
export function getCursorDisplay(): DisplayRef {
  const { id, bounds } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return { id, bounds };
}

/** 연결된 모든 디스플레이 — 영역 선택은 모니터마다 창을 하나씩 띄운다. */
export function getAllDisplayRefs(): DisplayRef[] {
  return screen.getAllDisplays().map(({ id, bounds }) => ({ id, bounds }));
}

/**
 * 오버레이용 BrowserWindow. show: false — 명시적 표시 전까지 숨김.
 *
 * NSPanel(type:'panel') 은 macOS 의 floating window 표준 — fullscreen Space
 * (Slack/Opera 등) 위에도 그대로 떠서 Space 전환 없이 overlay 가 표시된다.
 * NSWindow(default) 와 달리 keyboard focus 도 받을 수 있도록 setVisibleOnAll
 * Workspaces + setAlwaysOnTop 조합으로 보강한다.
 */
export function createOverlayWindow(bounds: DisplayBounds): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
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
    // 선택 오버레이는 opacity 0 standby 로 늘 order-in 돼 있어 생성 시점부터 Mission Control 에서 뺀다 (PR #8).
    hiddenInMissionControl: true,
    enableLargerThanScreen: true,
    type: 'panel',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
    },
  });
  configureFloatingWindow(win);
  return win;
}

/**
 * AX 권한이 없으면 시스템 프롬프트를 띄우고 안내 알림을 보낸다.
 * 권한 없이도 오버레이는 동작한다 — element-at 이 null 을 반환할 뿐.
 */
export function promptAccessibilityIfMissing(body: string): void {
  if (ensureAccessibilityPermission(false)) return;
  ensureAccessibilityPermission(true);
  new Notification({ title: tMain().accessibility.title, body }).show();
}

export function logDidFailLoad(win: BrowserWindow, label: string): void {
  win.webContents.on('did-fail-load', (...[, code, desc, url]) => {
    console.error(`[asis] ${label} did-fail-load code=${String(code)} desc=${desc} url=${url}`);
  });
}

/** macOS 26β 에서 transparent+alwaysOnTop 창이 자동 focus 를 못 받는 회귀 우회. */
export function refocusOnReadyToShow(win: BrowserWindow): void {
  win.once('ready-to-show', () => {
    win.focus();
    win.webContents.focus();
  });
}

/**
 * 이 창의 renderer 가 capture:ready 를 보내면 한 번 호출한다. 해제 함수를 반환한다.
 *
 * sender 로 이 창만 판정하고, 해제도 이 리스너만 한다 — 채널 전역 once()·
 * removeAllListeners 를 쓰면 selection prewarm 창의 ready 를 오인하거나 지워서
 * 다음 show 가 prewarmed-loading 경로로 빠진다 (실측 +438ms 지연).
 */
export function onceRendererReady(win: BrowserWindow, cb: () => void): () => void {
  const onReady = (event: IpcMainEvent): void => {
    if (event.sender !== win.webContents) return;
    ipcMain.removeListener(CHANNEL_READY, onReady);
    cb();
  };
  ipcMain.on(CHANNEL_READY, onReady);
  return () => ipcMain.removeListener(CHANNEL_READY, onReady);
}

/**
 * AX 요소 치수 조회 provider — 오버레이 로컬 좌표 ↔ 전역 스크린 좌표 변환.
 * 이 창의 invoke 만 응답하고, standby/종료 직후 잔여 invoke 는 null 로 조용히 처리한다.
 */
export function createLocalElementAtProvider(
  win: BrowserWindow,
  origin: { x: number; y: number },
): ElementAtProvider {
  return createMultiLocalElementAtProvider(() => [{ win, origin }]);
}

/**
 * 여러 오버레이 창(모니터별)용 — invoke 한 sender 창의 origin 으로 변환한다.
 * targets 는 호출 시점에 읽는다 (세션 도중 창이 추가될 수 있음).
 */
export function createMultiLocalElementAtProvider(
  targets: () => readonly { win: BrowserWindow; origin: { x: number; y: number } }[],
): ElementAtProvider {
  return (event, x, y) => {
    const target = targets().find(
      ({ win }) => !win.isDestroyed() && event.sender === win.webContents,
    );
    if (!target) return null;
    const { origin } = target;
    const result = getElementBoundsAtPoint(x + origin.x, y + origin.y);
    if (!result) return null;
    return { ...result, x: result.x - origin.x, y: result.y - origin.y };
  };
}

/** 창이 살아 있는 동안 주기 실행. 창이 사라지면 스스로 멈춘다. 해제 함수를 반환한다. */
export function startWindowInterval(
  win: BrowserWindow,
  intervalMs: number,
  tick: () => void,
): () => void {
  const id = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(id);
      return;
    }
    tick();
  }, intervalMs);
  return () => clearInterval(id);
}

/**
 * background 스냅샷 폴링. 이전 캡처가 끝나지 않았으면 그 tick 은 건너뛰어
 * (시스템 부하 등) IO·CPU 누적을 막는다. 영구 실패 시 반복 로그를 피하려고
 * 첫 실패만 기록한다. 해제 함수를 반환한다.
 */
export function startBackgroundPolling(
  win: BrowserWindow,
  display: DisplayRef,
  label: string,
): () => void {
  let inFlight = false;
  let failureLogged = false;
  return startWindowInterval(win, BACKGROUND_POLL_MS, () => {
    if (inFlight) return;
    inFlight = true;
    sendBackgroundSnapshot(win, display)
      .catch((err: unknown) => {
        if (failureLogged) return;
        failureLogged = true;
        console.warn(`[asis] ${label} background polling 실패 (이후 silent):`, err);
      })
      .finally(() => {
        inFlight = false;
      });
  });
}
