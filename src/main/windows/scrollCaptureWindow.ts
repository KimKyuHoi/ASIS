import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
} from 'electron';
import { is } from '@electron-toolkit/utils';
import { copyFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRendererPage, preloadPath } from './common';
import { pickRecorderPlacement } from './recorderPlacement';
import { ScrollCaptureManager } from '../scroll-capture/scrollCapture';
import { tMain } from '../i18n/strings';

const CHANNEL_STOP = 'scroll-capture:stop';
const CHANNEL_CANCEL = 'scroll-capture:cancel';
const CHANNEL_GET_FRAME_COUNT = 'scroll-capture:get-frame-count';

export type ScrollCaptureResult =
  | { kind: 'saved'; path: string } |
  { kind: 'copied' } |
  { kind: 'canceled' } |
  { kind: 'failed'; error: Error };

/**
 * 스크롤 캡처 알약(floating bar) lifecycle 관리.
 *
 * GIF/영상 recorder 알약과 골격이 동일하다(알약 · settle 단일 종료점 · ESC 취소 ·
 * getFrameCount polling). 다른 점: 정지 시 프레임들을 세로 스티칭해 *한 장의 긴 PNG*
 * 를 만들고, 저장 다이얼로그로 PNG 를 저장한다. 프레임 수 polling 은 GIF recorder 와
 * 동일하게 CHANNEL_GET_FRAME_COUNT 로 노출하므로 settle 에서 removeHandler 필수.
 *
 * placement 계산은 recorderPlacement 모듈을 recorder 들과 공유한다.
 */
export class ScrollCaptureWindowManager {
  private win: BrowserWindow | null = null;
  private capture = new ScrollCaptureManager();
  private hidden = false;

  /** 알약이 hidden(rect 가 화면 거의 전체) 인지 — main 이 시작 알림으로 단축키 안내. */
  isHidden(): boolean {
    return this.hidden;
  }

  /** 캡처 중(알약 떠있음) 인지. */
  isActive(): boolean {
    return this.win !== null && !this.win.isDestroyed();
  }

  /**
   * @param rect 캡처 영역(전역 논리 좌표) 겸 알약 placement 계산용 화면 좌표.
   */
  show(
    rect: { x: number; y: number; w: number; h: number },
  ): Promise<ScrollCaptureResult> {
    if (this.win) {
      return Promise.resolve({ kind: 'canceled' });
    }

    // 전체 디스플레이를 넘긴다 — primary 만 넘기면 보조 모니터의 영역을 캡처할 때
    // 후보 좌표가 전부 primary 밖이라 자리가 남아 있어도 hidden 이 된다.
    const winW = 360;
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
      show: !placement.hidden,
      webPreferences: {
        preload: preloadPath(),
        sandbox: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // 알약이 캡처 프레임에 잡히지 않도록 — 캡처 대상에서 제외.
    win.setContentProtection(true);
    this.win = win;
    this.hidden = placement.hidden;
    if (placement.hidden && is.dev) {
      console.info('[asis scroll] rect 가 너무 커 알약 hidden — 단축키로 정지 가능');
    }

    win.webContents.on(
      'console-message',
      (_event, level, message, line, sourceId) => {
        if (message.includes('[asis')) {
          if (is.dev) console.info(`[scroll-capture L${level}]`, message);
        } else if (level === 3 && !message.includes('Autofill')) {
          console.error(`[scroll-capture error] ${message} (${sourceId}:${line})`);
        }
      },
    );

    loadRendererPage(win, 'scroll-capture').catch((err: unknown) => {
      console.error('[asis] scrollCaptureWindow load failed', err);
    });

    return new Promise<ScrollCaptureResult>((resolve) => {
      let settled = false;
      const settle = (result: ScrollCaptureResult): void => {
        if (settled) return;
        settled = true;
        ipcMain.removeAllListeners(CHANNEL_STOP);
        ipcMain.removeAllListeners(CHANNEL_CANCEL);
        // getFrameCount 는 handle 로 등록했으므로 반드시 removeHandler.
        ipcMain.removeHandler(CHANNEL_GET_FRAME_COUNT);
        globalShortcut.unregister('Escape');
        if (!win.isDestroyed()) win.close();
        this.win = null;
        resolve(result);
      };

      const cancelCurrent = (): Promise<void> => this.capture.cancel();

      // ESC 글로벌 — 알약이 hidden 이거나 focus 못 받는 케이스에도 취소 가능.
      globalShortcut.register('Escape', () => {
        cancelCurrent().finally(() => settle({ kind: 'canceled' }));
      });

      // 고정 헤더/푸터 ignore 마진 — 기본 0(겹침 전체 비교).
      // 사용자 설정으로 노출하려면 MiscConfig 에 scrollIgnoreTop/Bottom 을 추가하고
      // 여기서 loadMisc() 로 읽어 넘긴다(배선 명세의 settings 항목 참고).
      this.capture
        .start({ rect, stitch: { ignoreTop: 0, ignoreBottom: 0 } })
        .catch((err: unknown) => {
          console.error('[asis] scroll capture start failed', err);
          settle({
            kind: 'failed',
            error: err instanceof Error ? err : new Error(String(err)),
          });
        });

      ipcMain.handle(CHANNEL_GET_FRAME_COUNT, () => this.capture.count());

      ipcMain.once(CHANNEL_STOP, () => {
        // 스티칭 시작을 알려 알약을 'stitching' 상태로 전환.
        if (!win.isDestroyed()) {
          win.webContents.send('scroll-capture:stitching');
        }
        const tmpPng = join(tmpdir(), `asis-scroll-${Date.now()}.png`);
        this.capture.stop(tmpPng).then(
          async (report) => {
            if (is.dev) {
              console.info(
                `[asis scroll] stitched ${report.frameCount} frames -> ${report.width}x${report.height} (confident ${report.confidentJoins}, fallback ${report.fallbackJoins})`,
              );
            }
            const defaultPath = join(
              app.getPath('pictures'),
              `ASIS-scroll-${Date.now()}.png`,
            );
            const saveResult = await dialog.showSaveDialog({
              defaultPath,
              filters: [{ name: tMain().scroll.pngFilterName, extensions: ['png'] }],
            });
            if (saveResult.canceled || !saveResult.filePath) {
              // 저장 취소 시 클립보드에는 복사해 결과를 잃지 않게 한다.
              const img = nativeImage.createFromPath(tmpPng);
              if (!img.isEmpty()) clipboard.writeImage(img);
              await unlink(tmpPng).catch((err: unknown) => {
                if (!isEnoent(err)) console.warn('[asis] scroll tmp cleanup failed', err);
              });
              settle({ kind: 'copied' });
              return;
            }
            await copyFile(tmpPng, saveResult.filePath).catch((err: unknown) => {
              console.error('[asis] scroll png copy failed', err);
            });
            await unlink(tmpPng).catch((err: unknown) => {
              if (!isEnoent(err)) console.warn('[asis] scroll tmp cleanup failed', err);
            });
            settle({ kind: 'saved', path: saveResult.filePath });
          },
          (err: unknown) => {
            console.error('[asis] scroll capture stop failed', err);
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
    this.capture.cancel().catch((err: unknown) => {
      console.warn('[asis] scroll capture stop: cancel failed', err);
    });
  }

  /**
   * 외부(글로벌 단축키/트레이) 에서 정지 트리거 — 알약 안 보여도 단축키로 정지.
   * 자기 webContents 에 IPC send 해서 알약 안의 정지 흐름을 그대로 재사용.
   */
  triggerStop(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send('scroll-capture:trigger-stop');
  }

  triggerCancel(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send('scroll-capture:trigger-cancel');
  }
}

function isEnoent(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
