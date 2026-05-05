import { BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'node:path';

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SelectionResult =
  | { kind: 'selected'; rect: Rect } |
  { kind: 'canceled' };

const CHANNEL_REGION = 'capture:region';
const CHANNEL_CANCEL = 'capture:cancel';

/**
 * 영역 선택 오버레이 — 풀스크린 transparent BrowserWindow lifecycle 관리.
 *
 * .claude/rules/side-effects.md 의 Class 판별 질문에 부합:
 *   "이 객체를 React 없이 단위 테스트로 의미 있게 검증할 수 있는가?" → Yes.
 *   BrowserWindow 라는 외부 리소스 + IPC 채널은 React 데이터 흐름 무관.
 *
 * lifecycle 패턴은 Tray·GlobalShortcut 의 영속 start/stop 과 다르다 —
 * ephemeral 이라 show() 가 promise 를 반환하고 결과 도출 후 자동 닫힌다.
 *
 * v1 한계 — primary display 만 다룬다 (다중 모니터는 v2).
 */
export class SelectionOverlayManager {
  private win: BrowserWindow | null = null;

  show(): Promise<SelectionResult> {
    if (this.win) {
      // 이미 떠 있으면 focus 후 silent canceled 반환 — 중복 캡처 방지.
      // null-safety: 의도된 옵셔널 흐름 (사용자가 단축키 두 번 누른 경우).
      this.win.focus();
      return Promise.resolve({ kind: 'canceled' });
    }

    const display = screen.getPrimaryDisplay();
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
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
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    });
    this.win = win;

    // 메뉴바 위까지 떠야 하므로 가장 높은 layer.
    win.setAlwaysOnTop(true, 'screen-saver');
    // 다른 앱이 fullscreen 이어도 그 위에 표시.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(
        `[asis] selectionOverlay did-fail-load code=${code} desc=${desc} url=${url}`,
      );
    });

    // dev / prod 모두 빌드된 selection 페이지를 file:// 로 로드.
    //
    // electron-vite multi-entry 의 dev URL 매핑이 vite docs 에서 명확하지 않아
    // (시도한 두 형식 모두 root 환영 페이지로 fallback) loadFile 로 통일.
    // 비용: selection 페이지 수정 시 별도 빌드 필요 (HMR 잃음). 영역 선택
    // 컴포넌트가 자주 변하지 않을 거라 감수 가능 — Phase 3 에디터에서 HMR 가
    // 진짜 필요해지면 그때 dev URL 매핑 정답을 다시 찾는다.
    const overlayPath = join(__dirname, '../renderer/selection/index.html');
    console.info(`[asis] selectionOverlay loadFile: ${overlayPath}`);
    win.loadFile(overlayPath).catch((err: unknown) => {
      console.error('[asis] selectionOverlay loadFile failed', err);
    });

    return new Promise<SelectionResult>((resolve) => {
      let settled = false;
      const settle = (result: SelectionResult): void => {
        if (settled) return;
        settled = true;
        // 핸들러·리스너 cleanup — leak 방지.
        ipcMain.removeHandler(CHANNEL_REGION);
        ipcMain.removeAllListeners(CHANNEL_CANCEL);
        if (!win.isDestroyed()) {
          win.close();
        }
        resolve(result);
      };

      ipcMain.handleOnce(CHANNEL_REGION, (_event, rect: Rect) => {
        settle({ kind: 'selected', rect });
      });

      ipcMain.once(CHANNEL_CANCEL, () => {
        settle({ kind: 'canceled' });
      });

      // 윈도우가 외부 요인 (Cmd+W, dock kill 등) 으로 닫히면 fallback canceled.
      win.on('closed', () => {
        this.win = null;
        settle({ kind: 'canceled' });
      });
    });
  }

  stop(): void {
    if (!this.win) return;
    if (!this.win.isDestroyed()) {
      this.win.close();
    }
    this.win = null;
  }
}
