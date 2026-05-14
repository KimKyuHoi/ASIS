import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  Notification,
  screen,
} from 'electron';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addEntry } from '../captureHistory';
import { settingsStore } from '../settings';

export type EditorResult =
  | { kind: 'copied' } |
  { kind: 'canceled' };

const CHANNEL_LOAD_IMAGE = 'editor:load-image';
const CHANNEL_READY = 'editor:ready';
const CHANNEL_COPY = 'editor:copy';
const CHANNEL_CANCEL = 'editor:cancel';
const CHANNEL_PIN = 'editor:pin';
const CHANNEL_SAVE = 'editor:save';
const CHANNEL_SAVE_FOLDER = 'editor:save-folder';

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
  /** PinWindowManager.pin 으로 위임할 콜백 — index.ts 에서 setPinHandler 로 주입. */
  private pinHandler:
    | ((dataUrl: string, w: number, h: number) => void) |
    null = null;

  setPinHandler(handler: (dataUrl: string, w: number, h: number) => void): void {
    this.pinHandler = handler;
  }

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
        ipcMain.removeHandler(CHANNEL_PIN);
        ipcMain.removeHandler(CHANNEL_SAVE);
        ipcMain.removeHandler(CHANNEL_SAVE_FOLDER);
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
        addEntry(dataUrl, imgW, imgH);
        settle({ kind: 'copied' });
      });

      ipcMain.once(CHANNEL_CANCEL, () => {
        settle({ kind: 'canceled' });
      });

      // 핀 — 어노테이션 결과를 떠있는 핀 윈도우로 띄움. 에디터는 닫지 않음.
      ipcMain.handle(
        CHANNEL_PIN,
        (_event, dataUrl: string, w: number, h: number) => {
          if (!this.pinHandler) {
            throw new Error('editor: pinHandler 미설정 — main 부트스트랩 확인');
          }
          this.pinHandler(dataUrl, w, h);
          addEntry(dataUrl, w, h);
        },
      );

      // 저장 — dataURL 을 PNG 파일로. dialog → fs.writeFile.
      ipcMain.handle(
        CHANNEL_SAVE,
        async (_event, dataUrl: string): Promise<{
          saved: boolean;
          path?: string;
        }> => {
          const defaultPath = join(
            app.getPath('pictures'),
            `ASIS-${Date.now()}.png`,
          );
          const result = await dialog.showSaveDialog(win, {
            defaultPath,
            filters: [{ name: 'PNG', extensions: ['png'] }],
          });
          if (result.canceled || !result.filePath) {
            return { saved: false };
          }
          // dataURL → Buffer.
          const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
          await writeFile(result.filePath, Buffer.from(base64, 'base64'));
          return { saved: true, path: result.filePath };
        },
      );

      // 폴더 자동 저장 — 설정된 폴더(없으면 ~/Pictures/ASIS) 에 타임스탬프 파일명으로 저장.
      // 다이얼로그 없이 즉시 저장 후 알림 표시 (macOS Screenshot 결).
      ipcMain.handle(
        CHANNEL_SAVE_FOLDER,
        async (_event, dataUrl: string): Promise<{ path: string }> => {
          const savedPath = settingsStore.get('saveFolderPath');
          const folder = savedPath || join(app.getPath('pictures'), 'ASIS');
          await mkdir(folder, { recursive: true });
          const now = new Date();
          const stamp = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            '_',
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0'),
          ].join('');
          const filePath = join(folder, `ASIS_${stamp}.png`);
          const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
          await writeFile(filePath, Buffer.from(base64, 'base64'));
          new Notification({
            title: 'ASIS — 저장 완료',
            body: filePath,
          }).show();
          return { path: filePath };
        },
      );

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
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
