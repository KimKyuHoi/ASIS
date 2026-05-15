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
import { existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addEntry } from '../captureHistory';
import devIconPath from '../../../resources/icon.png?asset';

function resolveAppIcon(): Electron.NativeImage {
  const prodPath = join(process.resourcesPath, 'icon.png');
  const iconPath = existsSync(prodPath) ? prodPath : devIconPath;
  return nativeImage.createFromPath(iconPath);
}
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
 *
 * prewarm() 을 앱 시작 시 호출해 BrowserWindow + HTML 로드를 미리 수행한다.
 * show() 호출 시점에는 setSize + show + IPC 전송만 하므로 체감 지연이 크게 줄어든다.
 */
export class EditorWindowManager {
  private win: BrowserWindow | null = null;
  private rendererReady = false;
  private active = false;
  private stopped = false;
  private pendingImageSend: (() => void) | null = null;
  private readyHandler: (() => void) | null = null;
  /** 현재 활성 세션의 settle 함수 — 교체 시 이전 세션을 취소하는 데 사용. */
  private currentSettleFn: ((r: EditorResult) => void) | null = null;

  /** PinWindowManager.pin 으로 위임할 콜백 — index.ts 에서 setPinHandler 로 주입. */
  private pinHandler:
    | ((dataUrl: string, w: number, h: number) => void) |
    null = null;

  setPinHandler(handler: (dataUrl: string, w: number, h: number) => void): void {
    this.pinHandler = handler;
  }

  prewarm(): void {
    if (this.stopped || this.win) return;

    const editorPath = join(__dirname, '../renderer/editor/index.html');
    const win = new BrowserWindow({
      width: 720,
      height: 480,
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
    this.rendererReady = false;

    win.webContents.on(
      'console-message',
      (_event, level, message, line, sourceId) => {
        if (message.includes('[asis')) {
          console.info(`[renderer L${level}]`, message);
        } else if (level === 3) {
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

    win.loadFile(editorPath).catch((err: unknown) => {
      console.error('[asis] editorWindow prewarm loadFile failed', err);
    });

    const onReady = (): void => {
      console.info('[asis editor:main] prewarm: editor:ready 수신');
      this.rendererReady = true;
      this.readyHandler = null;
      if (this.pendingImageSend) {
        this.pendingImageSend();
        this.pendingImageSend = null;
      }
    };
    this.readyHandler = onReady;
    ipcMain.once(CHANNEL_READY, onReady);

    // prewarm 상태에서 창이 닫히는 경우 (비정상 종료 등) 정리 후 재시도
    win.once('closed', () => {
      if (this.win === win) {
        this.win = null;
        this.rendererReady = false;
        this.pendingImageSend = null;
      }
      if (!this.stopped && !this.active) {
        setImmediate(() => this.prewarm());
      }
    });
  }

  show(imagePath: string): Promise<EditorResult> {
    if (this.active) {
      if (this.currentSettleFn) {
        // 이전 세션 취소 → active=false, win=null 로 설정됨.
        // 이후 코드가 새 이미지로 세션을 재시작한다.
        this.currentSettleFn({ kind: 'canceled' });
      } else {
        // 방어: settle 함수 없으면 새 파일 정리 후 종료.
        unlink(imagePath).catch((err: unknown) => {
          if (!isFileNotFound(err)) {
            console.error('[asis] editorWindow skip-cleanup failed', err);
          }
        });
        return Promise.resolve({ kind: 'canceled' });
      }
    }

    if (!this.win) {
      // app 시작 직후 단축키가 눌린 경우 — fallback 생성
      this.prewarm();
    }

    if (!this.win) {
      throw new Error('editor: prewarm 후에도 BrowserWindow 없음');
    }
    const win = this.win;
    this.active = true;

    const image = nativeImage.createFromPath(imagePath);
    if (image.isEmpty()) {
      this.active = false;
      return Promise.reject(
        new Error(`editor: empty image at ${imagePath}`),
      );
    }
    const { width: imgW, height: imgH } = image.getSize();

    const display = screen.getPrimaryDisplay();
    const padX = 80;
    const padY = 200;
    const winW = Math.min(imgW + padX, display.workAreaSize.width - 80);
    const winH = Math.min(imgH + padY, display.workAreaSize.height - 80);
    win.setSize(Math.max(winW, 720), Math.max(winH, 480));
    win.center();

    const sendImage = (): void => {
      if (!win.isDestroyed()) {
        console.info('[asis editor:main] image 전송');
        win.webContents.send(CHANNEL_LOAD_IMAGE, imagePath, imgW, imgH);
      }
    };

    return new Promise<EditorResult>((resolve) => {
      let settled = false;
      const settle = (result: EditorResult): void => {
        if (settled) return;
        settled = true;
        this.active = false;
        this.currentSettleFn = null;
        // 즉시 null — win.close() 는 비동기이므로 closed 이벤트 전에
        // 다음 show() 가 들어오면 닫히는 창을 재사용해 "Object destroyed" 에러 발생.
        this.win = null;
        this.rendererReady = false;
        ipcMain.removeHandler(CHANNEL_COPY);
        ipcMain.removeHandler(CHANNEL_PIN);
        ipcMain.removeHandler(CHANNEL_SAVE);
        ipcMain.removeHandler(CHANNEL_SAVE_FOLDER);
        ipcMain.removeAllListeners(CHANNEL_CANCEL);
        if (this.readyHandler) {
          ipcMain.removeListener(CHANNEL_READY, this.readyHandler);
          this.readyHandler = null;
        }
        this.pendingImageSend = null;
        if (!win.isDestroyed()) {
          // closed 리스너 제거 — 창 닫힘 이벤트가 새 win 을 null 로 덮어쓰는 것 방지.
          win.removeAllListeners('closed');
          win.close();
        }
        unlink(imagePath).catch((err: unknown) => {
          if (!isFileNotFound(err)) {
            console.error('[asis] editorWindow tmp cleanup failed', err);
          }
        });
        resolve(result);
        if (!this.stopped) {
          setImmediate(() => this.prewarm());
        }
      };
      this.currentSettleFn = settle;

      ipcMain.handleOnce(CHANNEL_COPY, (_event, dataUrl: string) => {
        const composed = nativeImage.createFromDataURL(dataUrl);
        if (composed.isEmpty()) {
          throw new Error('editor: empty NativeImage from dataURL');
        }
        clipboard.writeImage(composed);
        addEntry(dataUrl, imgW, imgH);
        settle({ kind: 'copied' });
      });

      ipcMain.once(CHANNEL_CANCEL, () => {
        settle({ kind: 'canceled' });
      });

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
          const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
          await writeFile(result.filePath, Buffer.from(base64, 'base64'));
          return { saved: true, path: result.filePath };
        },
      );

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
            icon: resolveAppIcon(),
          }).show();
          return { path: filePath };
        },
      );

      // prewarm 이 등록한 closed 핸들러를 제거하고 show 용으로 교체
      win.removeAllListeners('closed');
      win.once('closed', () => {
        this.win = null;
        this.rendererReady = false;
        settle({ kind: 'canceled' });
      });

      // renderer 준비 여부에 따라 즉시 전송하거나 대기
      if (this.rendererReady) {
        sendImage();
      } else {
        this.pendingImageSend = sendImage;
      }

      win.show();
      if (process.platform === 'darwin') {
        app.focus({ steal: true });
      }
      win.focus();
      win.moveTop();
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.readyHandler) {
      ipcMain.removeListener(CHANNEL_READY, this.readyHandler);
      this.readyHandler = null;
    }
    if (!this.win || this.win.isDestroyed()) return;
    this.win.close();
    this.win = null;
  }
}

function isFileNotFound(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
