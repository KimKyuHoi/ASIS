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
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SequenceCaptureManager } from '../sequenceCapture';
import { encodeGifFromVideo, VideoCaptureManager } from '../videoCapture';
import { settingsStore } from '../settings';

const CHANNEL_STOP = 'recorder:stop';
const CHANNEL_CANCEL = 'recorder:cancel';
const CHANNEL_GET_FRAME_COUNT = 'recorder:get-frame-count';

export type RecorderResult =
  | { kind: 'saved'; path: string } |
  { kind: 'canceled' } |
  { kind: 'failed'; error: Error };

/**
 * 시퀀스 캡처 컨트롤 윈도우 lifecycle 관리.
 *
 * 흐름
 *   1) 사용자 영역 선택 (selectionOverlay 재사용) → rect 받음
 *   2) RecorderWindowManager.show(rect) 호출
 *      - SequenceCaptureManager.start(rect) — interval 캡처 시작
 *      - 작은 floating BrowserWindow 띄움 (정지/취소/경과)
 *   3) 사용자 "정지" → GIF 인코딩 → 파일 저장 다이얼로그 → 결과 리턴
 *   4) 사용자 "취소" → frames 폐기 → canceled
 */
export type RecorderMode = 'sequence' | 'video';

export class RecorderWindowManager {
  private win: BrowserWindow | null = null;
  private sequence = new SequenceCaptureManager();
  private video = new VideoCaptureManager();
  private mode: RecorderMode = 'sequence';

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
    mode: RecorderMode = 'sequence',
  ): Promise<RecorderResult> {
    if (this.win) {
      return Promise.resolve({ kind: 'canceled' });
    }
    this.mode = mode;

    // 알약 위치 fitting — rect 와 안 겹치는 가장자리 자동 선택.
    // 후보 모두 실패 (rect 가 화면 거의 전체) 면 알약을 *안 띄우고* 시작 알림으로
    // 단축키 안내. 정지는 ⌘⇧G toggle.
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
      // hidden 결정되면 mount 후 안 띄움.
      show: !placement.hidden,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
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

    const recorderPath = join(__dirname, '../renderer/recorder/index.html');
    win.loadFile(recorderPath).catch((err: unknown) => {
      console.error('[asis] recorderWindow loadFile failed', err);
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

      // ESC 글로벌 — 알약이 hidden 이거나 focus 못 받는 케이스에도 취소 가능.
      globalShortcut.register('Escape', () => {
        this.sequence.cancel().finally(() => settle({ kind: 'canceled' }));
      });

      // 모드별 녹화 시작.
      const gifFps = settingsStore.get('misc').gifFps;
      if (this.mode === 'sequence') {
        this.sequence.start({ rect, fps: gifFps }).catch((err: unknown) => {
          console.error('[asis] sequence start failed', err);
          settle({
            kind: 'failed',
            error: err instanceof Error ? err : new Error(String(err)),
          });
        });
      } else {
        this.video.start({ rect }).catch((err: unknown) => {
          console.error('[asis] video start failed', err);
          settle({
            kind: 'failed',
            error: err instanceof Error ? err : new Error(String(err)),
          });
        });
      }

      // frame count — 시퀀스만 의미. 영상은 0 (recorder UI 가 시간만 표시).
      ipcMain.handle(CHANNEL_GET_FRAME_COUNT, () =>
        this.mode === 'sequence' ? this.sequence.count() : 0,
      );

      ipcMain.once(CHANNEL_STOP, () => {
        if (!win.isDestroyed()) {
          win.webContents.send('recorder:encoding');
        }
        const tmpGif = join(tmpdir(), `asis-gif-${Date.now()}.gif`);
        // 모드별 인코딩.
        const stopPromise = this.mode === 'sequence'
          ? this.sequence.stop(tmpGif)
          : this.video.stop().then(async (videoPath) => {
            await encodeGifFromVideo(videoPath, tmpGif, { fps: gifFps });
            return tmpGif;
          });
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

      const cancelCurrent = (): Promise<void> => {
        if (this.mode === 'sequence') return this.sequence.cancel();
        this.video.cancel();
        return Promise.resolve();
      };

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

type Placement = { x: number; y: number; hidden: boolean };

/**
 * 알약 위치 fitting — 캡처 rect 와 안 겹치는 곳 우선순위:
 *   1) menubar 영역 (display.bounds.y 위, workArea.y 아래)
 *   2) dock 아래 (workArea 아래)
 *   3) rect 위쪽 / 아래쪽 (workArea 안에서 rect 와 겹치지 않게)
 *   4) rect 우측 / 좌측
 *   5) hidden — rect 가 화면 거의 전체. 알약 안 띄움
 */
function pickRecorderPlacement(
  rect: { x: number; y: number; w: number; h: number },
  recW: number,
  recH: number,
  display: Electron.Display,
): Placement {
  const bounds = display.bounds;
  const margin = 6;
  const centerX = Math.round(bounds.x + (bounds.width - recW) / 2);

  const candidates: Array<Placement> = [
    // menubar 영역 위쪽 (display.bounds.y ~ workArea.y).
    // workArea.y > bounds.y 이면 menubar 가 있고 그 위 공간이 있음.
    { x: centerX, y: bounds.y + 4, hidden: false },
    // dock 아래 (workArea 끝 ~ display.bounds 끝). 충분한 공간이 있을 때만.
    {
      x: centerX,
      y: bounds.y + bounds.height - recH - 4,
      hidden: false,
    },
    // rect 위 (workArea 안)
    {
      x: centerX,
      y: rect.y - recH - margin,
      hidden: false,
    },
    // rect 아래
    {
      x: centerX,
      y: rect.y + rect.h + margin,
      hidden: false,
    },
    // rect 우측
    {
      x: rect.x + rect.w + margin,
      y: rect.y,
      hidden: false,
    },
    // rect 좌측
    {
      x: rect.x - recW - margin,
      y: rect.y,
      hidden: false,
    },
  ];

  for (const c of candidates) {
    const cBox = { x: c.x, y: c.y, w: recW, h: recH };
    const inDisplay =
      cBox.x >= bounds.x &&
      cBox.x + cBox.w <= bounds.x + bounds.width &&
      cBox.y >= bounds.y &&
      cBox.y + cBox.h <= bounds.y + bounds.height;
    if (!inDisplay) continue;
    if (rectsIntersect(cBox, rect)) continue;
    // 첫 번째 후보 (menubar/dock) 면 workArea 와 겹쳐도 OK — menubar/dock 영역.
    // 다른 후보들은 workArea 안이어야 자연스러움.
    return c;
  }

  // 모두 실패 — hidden. 좌표는 임의 (어차피 안 보임).
  return { x: bounds.x, y: bounds.y, hidden: true };
}

function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return !(
    a.x + a.w <= b.x ||
    a.x >= b.x + b.w ||
    a.y + a.h <= b.y ||
    a.y >= b.y + b.h
  );
}


function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
