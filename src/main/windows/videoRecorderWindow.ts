import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
} from 'electron';
import { is } from '@electron-toolkit/utils';
import { copyFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRendererPage, preloadPath } from './common';
import { pickRecorderPlacement } from './recorderPlacement';
import { ScreenRecordManager } from '../screenRecord';

const CHANNEL_STOP = 'video-recorder:stop';
const CHANNEL_CANCEL = 'video-recorder:cancel';

export type VideoRecorderResult =
  | { kind: 'saved'; path: string } |
  { kind: 'canceled' } |
  { kind: 'failed'; error: Error };

/**
 * 화면 영상 녹화 알약(floating bar) lifecycle 관리.
 *
 * GIF 의 RecorderWindowManager 와 형태는 같지만(알약·settle 단일 종료점·ESC 취소),
 * 완료 처리가 다르다: 인코딩 단계 없이 정지 즉시 .mov 저장 다이얼로그, 프레임 개념
 * 없음. 그래서 GIF recorder 를 확장하지 않고 별도로 둔다 (계획: video 전용 분리).
 *
 * placement 계산은 recorderPlacement 모듈을 GIF recorder 와 공유한다.
 */
export class VideoRecorderWindowManager {
  private win: BrowserWindow | null = null;
  private recorder = new ScreenRecordManager();
  private hidden = false;

  /** 알약이 hidden(rect 가 화면 거의 전체) 인지 — main 이 시작 알림으로 단축키 안내. */
  isHidden(): boolean {
    return this.hidden;
  }

  /** 녹화 중(알약 떠있음) 인지. */
  isActive(): boolean {
    return this.win !== null && !this.win.isDestroyed();
  }

  /**
   * @param rect 녹화 영역(전역 논리 좌표) 겸 알약 placement 계산용 화면 좌표.
   */
  show(
    rect: { x: number; y: number; w: number; h: number },
  ): Promise<VideoRecorderResult> {
    if (this.win) {
      return Promise.resolve({ kind: 'canceled' });
    }

    const display = screen.getPrimaryDisplay();
    const winW = 320;
    const winH = 38;
    const placement = pickRecorderPlacement(rect, winW, winH, display);

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
      show: !placement.hidden,
      webPreferences: {
        preload: preloadPath(),
        sandbox: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // 알약이 녹화 영상에 잡히지 않도록 — 캡처 대상에서 제외.
    win.setContentProtection(true);
    this.win = win;
    this.hidden = placement.hidden;
    if (placement.hidden && is.dev) {
      console.info('[asis video] rect 가 너무 커 알약 hidden — ⌘⇧E 로 정지 가능');
    }

    win.webContents.on(
      'console-message',
      (_event, level, message, line, sourceId) => {
        if (message.includes('[asis')) {
          if (is.dev) console.info(`[video-recorder L${level}]`, message);
        } else if (level === 3 && !message.includes('Autofill')) {
          console.error(
            `[video-recorder error] ${message} (${sourceId}:${line})`,
          );
        }
      },
    );

    loadRendererPage(win, 'video-recorder').catch((err: unknown) => {
      console.error('[asis] videoRecorderWindow load failed', err);
    });

    return new Promise<VideoRecorderResult>((resolve) => {
      let settled = false;
      const settle = (result: VideoRecorderResult): void => {
        if (settled) return;
        settled = true;
        ipcMain.removeAllListeners(CHANNEL_STOP);
        ipcMain.removeAllListeners(CHANNEL_CANCEL);
        globalShortcut.unregister('Escape');
        if (!win.isDestroyed()) win.close();
        this.win = null;
        resolve(result);
      };

      const cancelCurrent = (): Promise<void> => this.recorder.cancel();

      // ESC 글로벌 — 알약이 hidden 이거나 focus 못 받는 케이스에도 취소 가능.
      globalShortcut.register('Escape', () => {
        cancelCurrent().finally(() => settle({ kind: 'canceled' }));
      });

      this.recorder.start(rect).catch((err: unknown) => {
        console.error('[asis] screen record start failed', err);
        settle({
          kind: 'failed',
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });

      ipcMain.once(CHANNEL_STOP, () => {
        this.recorder.stop().then(
          async (videoPath) => {
            // Electron 의 'videos' 경로 키가 macOS 의 ~/Movies 에 매핑된다.
            const defaultPath = join(
              app.getPath('videos'),
              `ASIS-${Date.now()}.mov`,
            );
            const result = await dialog.showSaveDialog({
              defaultPath,
              filters: [{ name: 'QuickTime Movie', extensions: ['mov'] }],
            });
            if (result.canceled || !result.filePath) {
              await unlink(videoPath).catch((err: unknown) => {
                if (!isEnoent(err)) {
                  console.warn('[asis] video tmp cleanup failed', err);
                }
              });
              settle({ kind: 'canceled' });
              return;
            }
            await copyFile(videoPath, result.filePath).catch((err: unknown) => {
              console.error('[asis] video copy failed', err);
            });
            await unlink(videoPath).catch((err: unknown) => {
              if (!isEnoent(err)) {
                console.warn('[asis] video tmp cleanup failed', err);
              }
            });
            settle({ kind: 'saved', path: result.filePath });
          },
          (err: unknown) => {
            console.error('[asis] video recorder stop failed', err);
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
    this.recorder.cancel().catch((err: unknown) => {
      console.warn('[asis] video recorder stop: cancel failed', err);
    });
  }

  /**
   * 외부(글로벌 단축키/트레이) 에서 정지 트리거 — 알약 안 보여도 ⌘⇧E 로 정지.
   * 자기 webContents 에 IPC send 해서 알약 안의 정지 흐름을 그대로 재사용.
   */
  triggerStop(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send('video-recorder:trigger-stop');
  }

  triggerCancel(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send('video-recorder:trigger-cancel');
  }
}

function isEnoent(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
