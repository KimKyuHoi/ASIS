import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
} from 'electron';
import { is } from '@electron-toolkit/utils';
import log from 'electron-log/main';
import { copyFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRendererPage, preloadPath } from './common';
import { pickRecorderPlacement } from './recorderPlacement';
import { SequenceCaptureManager } from '../capture/sequenceCapture';
import { settingsStore } from '../settings';

const CHANNEL_STOP = 'recorder:stop';
const CHANNEL_CANCEL = 'recorder:cancel';
const CHANNEL_GET_FRAME_COUNT = 'recorder:get-frame-count';

export type RecorderResult =
  | { kind: 'saved'; path: string } |
  { kind: 'canceled' } |
  { kind: 'failed'; error: Error };

export class RecorderWindowManager {
  private win: BrowserWindow | null = null;
  private sequence = new SequenceCaptureManager();

  /**
   * 시작 시 hidden 으로 떠있는지 (rect 가 화면 거의 전체) 외부에서 알 수 있도록.
   * main/index.ts 가 그 경우 시작 알림으로 단축키 안내.
   */
  isHidden(): boolean {
    return this.hidden;
  }

  private hidden = false;

  show(
    rect: { x: number; y: number; w: number; h: number },
  ): Promise<RecorderResult> {
    if (this.win) {
      return Promise.resolve({ kind: 'canceled' });
    }

    // 알약 위치 fitting — rect 와 안 겹치는 가장자리 자동 선택.
    // 보조 모니터가 있으면 그쪽으로 피하고, 단일 모니터 전체화면처럼 피할 곳이
    // 아예 없으면 알약을 *안 띄우고* 알림 + 트레이 메뉴로 정지를 안내한다.
    const winW = 320;
    const winH = 38;
    const placement = pickRecorderPlacement(rect, winW, winH, screen.getAllDisplays());

    const win = new BrowserWindow({
      width: winW,
      height: winH,
      x: placement.x,
      y: placement.y,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: false,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      // hidden 결정되면 mount 후 안 띄움.
      show: !placement.hidden,
      webPreferences: {
        preload: preloadPath(),
        sandbox: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setContentProtection(true);
    this.win = win;
    this.hidden = placement.hidden;
    if (placement.hidden && is.dev) {
      console.info(
        '[asis recorder] rect 가 너무 커 알약 hidden — ⌘⇧G 로 정지 가능',
      );
    }

    win.webContents.on(
      'console-message',
      (_event, level, message, line, sourceId) => {
        if (message.includes('[asis')) {
          if (is.dev) console.info(`[recorder L${level}]`, message);
        } else if (level === 3 && !message.includes('Autofill')) {
          console.error(`[recorder error] ${message} (${sourceId}:${line})`);
        }
      },
    );

    loadRendererPage(win, 'recorder').catch((err: unknown) => {
      console.error('[asis] recorderWindow load failed', err);
    });

    return new Promise<RecorderResult>((resolve) => {
      let settled = false;
      const settle = (result: RecorderResult): void => {
        if (settled) return;
        settled = true;
        ipcMain.removeAllListeners(CHANNEL_STOP);
        ipcMain.removeAllListeners(CHANNEL_CANCEL);
        ipcMain.removeHandler(CHANNEL_GET_FRAME_COUNT);
        globalShortcut.unregister('Escape');
        if (!win.isDestroyed()) win.close();
        this.win = null;
        resolve(result);
      };

      const cancelCurrent = (): Promise<void> => this.sequence.cancel();

      // ESC 글로벌 — 알약이 hidden 이거나 focus 못 받는 케이스에도 취소 가능.
      globalShortcut.register('Escape', () => {
        cancelCurrent().finally(() => settle({ kind: 'canceled' }));
      });

      const gifFps = settingsStore.get('misc').gifFps;
      // [perf] 콜드스타트 진단 — 시퀀스 캡처 시작 지연 확인용.
      const startAt = Date.now();
      this.sequence.start({ rect, fps: gifFps }).then(() => {
        log.info(`[perf] GIF 녹화 시작 +${Date.now() - startAt}ms`);
      }).catch((err: unknown) => {
        console.error('[asis] sequence start failed', err);
        settle({
          kind: 'failed',
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });

      ipcMain.handle(CHANNEL_GET_FRAME_COUNT, () => this.sequence.count());

      ipcMain.once(CHANNEL_STOP, () => {
        if (!win.isDestroyed()) {
          win.webContents.send('recorder:encoding');
        }
        const tmpGif = join(tmpdir(), `asis-gif-${Date.now()}.gif`);
        const stopPromise = this.sequence.stop(tmpGif);
        stopPromise.then(
          async (gifPath) => {
            const defaultPath = join(
              app.getPath('pictures'),
              `ASIS-${Date.now()}.gif`,
            );
            const result = await dialog.showSaveDialog({
              defaultPath,
              filters: [{ name: 'GIF', extensions: ['gif'] }],
            });
            if (result.canceled || !result.filePath) {
              await unlink(gifPath).catch((err: unknown) => {
                if (!isEnoent(err)) console.warn('[asis] gif tmp cleanup failed', err);
              });
              settle({ kind: 'canceled' });
              return;
            }
            await copyFile(gifPath, result.filePath).catch((err: unknown) => {
              console.error('[asis] gif copy failed', err);
            });
            await unlink(gifPath).catch((err: unknown) => {
              if (!isEnoent(err)) console.warn('[asis] gif tmp cleanup failed', err);
            });
            settle({ kind: 'saved', path: result.filePath });
          },
          (err: unknown) => {
            console.error('[asis] recorder stop failed', err);
            settle({
              kind: 'failed',
              error: err instanceof Error ? err : new Error(String(err)),
            });
          },
        );
      });

      ipcMain.once(CHANNEL_CANCEL, () => {
        cancelCurrent().finally(() => settle({ kind: 'canceled' }));
      });

      win.on('closed', () => {
        cancelCurrent().finally(() => settle({ kind: 'canceled' }));
      });
    });
  }

  stop(): void {
    if (!this.win) return;
    if (!this.win.isDestroyed()) this.win.close();
    this.win = null;
    this.sequence.cancel().catch((err: unknown) => {
      console.warn('[asis] recorder stop: sequence cancel failed', err);
    });
  }

  /** 녹화 중 (recorder window 떠있음) 인지. */
  isActive(): boolean {
    return this.win !== null && !this.win.isDestroyed();
  }

  /**
   * 외부 (글로벌 단축키 등) 에서 정지 트리거 — 알약 안 보여도 ⌘⇧G 로 정지.
   * 자기 webContents 에 IPC send 해서 *알약 안의 정지 흐름* 을 그대로 재사용.
   */
  triggerStop(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send('recorder:trigger-stop');
  }

  triggerCancel(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send('recorder:trigger-cancel');
  }
}

function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
