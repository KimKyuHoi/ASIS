import { ipcMain, type BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';
import { clearElementAtProvider, loadRendererPage, setElementAtProvider } from './common';
import {
  createLocalElementAtProvider,
  createOverlayWindow,
  getCursorDisplay,
  logDidFailLoad,
  onceRendererReady,
  promptAccessibilityIfMissing,
  refocusOnReadyToShow,
  startBackgroundPolling,
} from './overlayWindow';
import { sendBackgroundSnapshot } from '../capture/displaySnapshot';
import { tMain } from '../i18n/strings';

/**
 * 화면 자 / 간격 측정 오버레이 — 풀스크린 transparent BrowserWindow lifecycle.
 *
 * 기존 SelectionOverlayManager 와 같은 renderer 엔트리('selection')를 `?mode=ruler`
 * query 로 재사용한다. 캡처 오버레이와의 차이:
 *   - 캡처하지 않는다 — capture:region 핸들러 없음. 결과 Promise 도 필요 없다.
 *   - window 목록(snap) 을 쓰지 않는다 — capture:windows / listWindows 폴링 없음.
 *   - background(Magnifier) + element-at(AX 치수) 만 제공한다.
 *   - ESC 로만 닫힌다(renderer 는 measured 상태를 유지하며 다시 드래그 가능).
 *
 * 별도 매니저로 둔 이유(side-effects.md / common.ts:44 주석):
 *   SelectionOverlayManager.show() 는 캡처 전용 Promise/settle/poll lifecycle 을
 *   갖는다. 여기에 측정 모드를 끼우면 종료 조건이 갈라져 복잡도가 급증한다.
 *   측정은 종료 결과값이 없는 단순 open/close 라 자체 매니저가 더 솔직하다.
 *
 * 룰
 *   - side-effects.md — 시스템 전역 lifecycle 객체는 Class 로 캡슐화.
 *   - null-safety.md — 권한/파일/exit code 를 명시 분기. 빈 catch 없음(이유 명시).
 *   - imperative-style.md — main process 명령형 OK.
 */

const CHANNEL_CANCEL = 'capture:cancel';

export class RulerOverlayManager {
  private win: BrowserWindow | null = null;
  private stopped = false;

  /** 측정 오버레이 열기. 이미 떠 있으면 focus 만(중복 방지). */
  open(): void {
    if (this.stopped) return;
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      return;
    }

    // AX 권한은 요소 치수 표시에만 필요하다 — 거리·눈금 측정은 권한 없이도 동작.
    promptAccessibilityIfMissing(tMain().accessibility.rulerBody);

    const display = getCursorDisplay();
    const win = createOverlayWindow(display.bounds);
    this.win = win;
    if (is.dev) console.info('[asis] rulerOverlay open');

    // ?mode=ruler 로 selection 엔트리를 측정 모드로 로드.
    loadRendererPage(win, 'selection', { mode: 'ruler' }).catch((err: unknown) => {
      console.error('[asis] rulerOverlay load failed', err);
    });
    logDidFailLoad(win, 'rulerOverlay');

    // background 캡처를 win.show() 보다 먼저 시작 — overlay dim 이 캡처에 안 찍히도록.
    const pushBackground = (reason: string): void => {
      sendBackgroundSnapshot(win, display).catch((err: unknown) => {
        console.warn(`[asis] ruler background(${reason}) 실패 (magnifier 비활성):`, err);
      });
    };
    pushBackground('open');

    win.show();
    win.focus();
    win.webContents.focus();
    refocusOnReadyToShow(win);

    // ESC 처리는 renderer 가 담당한다 — measured 상태에서는 "측정 지우기", idle
    // 에서는 cancel IPC 로 창 닫기(2단계). 여기서 globalShortcut ESC 를 별도 등록하지
    // 않는 이유: 그러면 measured 결과가 첫 ESC 에 곧바로 삭제되어 완충 UX 가 깨진다.
    this.subscribe(win, [
      // renderer ready 시 background 를 다시 한 번 밀어 준다(초기 유실 대비).
      onceRendererReady(win, () => pushBackground('ready')),
      startBackgroundPolling(win, display, 'ruler'),
    ], display.bounds);
  }

  stop(): void {
    this.stopped = true;
    if (!this.win) return;
    if (!this.win.isDestroyed()) this.win.close();
    this.win = null;
  }

  /**
   * element-at provider 와 cancel IPC 를 연결하고, 창이 닫히면(cancel·stop 등
   * 어떤 경로든) 받은 해제 함수까지 한 번에 정리한다.
   */
  private subscribe(
    win: BrowserWindow,
    unsubscribes: (() => void)[],
    origin: { x: number; y: number },
  ): void {
    // 전역 핸들러 + provider 교체 (common.ts) — 이 창의 invoke 만 응답한다.
    const elementAtProvider = createLocalElementAtProvider(win, origin);
    setElementAtProvider(elementAtProvider);

    const cleanup = (): void => {
      clearElementAtProvider(elementAtProvider);
      ipcMain.removeAllListeners(CHANNEL_CANCEL);
      for (const unsubscribe of unsubscribes) unsubscribe();
      this.win = null;
    };

    // renderer 의 ESC → cancel IPC 로 창 닫기.
    ipcMain.once(CHANNEL_CANCEL, () => {
      cleanup();
      if (!win.isDestroyed()) win.close();
    });
    win.on('closed', cleanup);
  }
}
