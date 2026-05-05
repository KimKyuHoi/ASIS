import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  nativeImage,
  screen,
} from 'electron';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

export type EditorResult =
  | { kind: 'copied' } |
  { kind: 'canceled' };

const CHANNEL_LOAD_IMAGE = 'editor:load-image';
const CHANNEL_READY = 'editor:ready';
const CHANNEL_COPY = 'editor:copy';
const CHANNEL_CANCEL = 'editor:cancel';

/**
 * 어노테이션 에디터 윈도우 — Konva 기반 React 페이지를 띄우고 사용자 어노테이션
 * 결과(dataURL) 를 받아 클립보드에 복사한다.
 *
 * .claude/rules/side-effects.md 의 Class 판별 질문 부합:
 *   "이 객체를 React 없이 단위 테스트로 의미 있게 검증할 수 있는가?" → Yes.
 *   BrowserWindow + IPC 채널 lifecycle 관리.
 *
 * lifecycle 패턴은 SelectionOverlay 와 동일 — show() 가 promise 반환,
 * 결과 도출 후 자동 닫힘.
 *
 * 캡처 파일은 *EditorWindow 가 닫힐 때 unlink* — capture.ts 가 직접 정리하지 않음.
 */
export class EditorWindowManager {
  private win: BrowserWindow | null = null;

  show(imagePath: string): Promise<EditorResult> {
    if (this.win) {
      this.win.focus();
      return Promise.resolve({ kind: 'canceled' });
    }

    // dock.show/hide dynamic 전환은 macOS 26β 가 거부. main/index.ts 의 dock.hide
    // 자체를 제거하는 우회로 전환. 여기서는 추가 작업 없음.

    // 이미지 크기 조회로 윈도우 사이즈 산정.
    const image = nativeImage.createFromPath(imagePath);
    if (image.isEmpty()) {
      return Promise.reject(
        new Error(`editor: empty image at ${imagePath}`),
      );
    }
    const { width: imgW, height: imgH } = image.getSize();

    const display = screen.getPrimaryDisplay();
    const padX = 80;
    const padY = 200; // 툴바·여백
    const winW = Math.min(imgW + padX, display.workAreaSize.width - 80);
    const winH = Math.min(imgH + padY, display.workAreaSize.height - 80);

    const win = new BrowserWindow({
      width: Math.max(winW, 720),
      height: Math.max(winH, 480),
      minWidth: 480,
      minHeight: 360,
      title: 'ASIS — 어노테이션',
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#161618',
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    });
    this.win = win;

    win.once('ready-to-show', () => {
      console.info('[asis editor:main] ready-to-show — show + focus 시도');
      win.show();
      if (process.platform === 'darwin') {
        app.focus({ steal: true });
      }
      win.focus();
      win.moveTop();
      console.info(
        '[asis editor:main] isFocused=',
        win.isFocused(),
        'isVisible=',
        win.isVisible(),
      );
    });

    // DevTools 안 띄워도 renderer console.log 가 터미널에 보이도록 forward.
    // (DevTools 자동 띄움은 거꾸로 keyboard focus 를 빼앗아 단축키/텍스트 막음.)
    win.webContents.on(
      'console-message',
      (_event, level, message, line, sourceId) => {
        // ASIS 우리 로그만 흘려서 chromium 노이즈 차단.
        if (message.includes('[asis')) {
          console.info(`[renderer L${level}]`, message);
        } else if (level === 3) {
          // level 3 = error — 다른 에러도 보고 (Autofill 같은 noise 제외).
          if (!message.includes('Autofill')) {
            console.error(
              `[renderer error] ${message} (${sourceId}:${line})`,
            );
          }
        }
      },
    );

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(
        `[asis] editorWindow did-fail-load code=${code} desc=${desc} url=${url}`,
      );
    });

    // 빌드된 파일 직접 로드 (selection overlay 와 같은 패턴 — dev URL 매핑이
    // multi-entry 에서 안정적이지 않아 file:// 로 통일).
    const editorPath = join(__dirname, '../renderer/editor/index.html');
    win.loadFile(editorPath).catch((err: unknown) => {
      console.error('[asis] editorWindow loadFile failed', err);
    });

    // renderer 가 onLoadImage listener 를 *attach 한 후* editor:ready 를 send.
    // 그 시점에 main 이 image path 를 보내야 메시지 유실이 없다.
    // (did-finish-load 직후 send 하면 React useEffect 가 listener attach 하기
    //  전이라 메시지가 사라지는 게 텍스트/이미지 안 뜨던 root cause 였다.)
    ipcMain.once(CHANNEL_READY, () => {
      console.info('[asis editor:main] editor:ready 수신, image 전송');
      if (!win.isDestroyed()) {
        win.webContents.send(CHANNEL_LOAD_IMAGE, imagePath, imgW, imgH);
      }
    });

    return new Promise<EditorResult>((resolve) => {
      let settled = false;
      const settle = (result: EditorResult): void => {
        if (settled) return;
        settled = true;
        ipcMain.removeHandler(CHANNEL_COPY);
        ipcMain.removeAllListeners(CHANNEL_CANCEL);
        ipcMain.removeAllListeners(CHANNEL_READY);
        if (!win.isDestroyed()) {
          win.close();
        }
        // 캡처 임시 파일 정리. 실패해도 결과에 영향 없음.
        unlink(imagePath).catch((err: unknown) => {
          if (!isFileNotFound(err)) {
            console.error('[asis] editorWindow tmp cleanup failed', err);
          }
        });
        resolve(result);
      };

      ipcMain.handleOnce(CHANNEL_COPY, (_event, dataUrl: string) => {
        // dataURL → NativeImage → 클립보드.
        const composed = nativeImage.createFromDataURL(dataUrl);
        if (composed.isEmpty()) {
          // null-safety: silent fallback 금지. 명시 throw 로 호출자 catch.
          throw new Error('editor: empty NativeImage from dataURL');
        }
        clipboard.writeImage(composed);
        settle({ kind: 'copied' });
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
    if (!this.win) return;
    if (!this.win.isDestroyed()) {
      this.win.close();
    }
    this.win = null;
  }
}

function isFileNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}
