import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  screen,
} from 'electron';
import { is } from '@electron-toolkit/utils';
import log from 'electron-log/main';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { configureFloatingWindow, loadRendererPage, preloadPath } from './common';
import { pickRecorderPlacement, placeInsideBottom } from './recorderPlacement';
import { ScreenRecordManager, isStartCanceled, type Rect, type RecordEngine } from '../video/screenRecord';
import { removeTempFile } from '../video/tempFile';
import { claimEsc } from './escClaim';
import { inputHighlight } from '../input-highlight/inputHighlight';
import { recordingRegionOverlay } from './recordingRegionOverlay';
import { tMain } from '../i18n/strings';
import { UserFacingError } from '../userFacingError';

const CHANNEL_STOP = 'video-recorder:stop';
const CHANNEL_CANCEL = 'video-recorder:cancel';

/** 알약(floating bar) 크기. */
const PILL_WIDTH = 320;
const PILL_HEIGHT = 38;

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
  private readonly recorder = new ScreenRecordManager();
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
  show(rect: Rect): Promise<VideoRecorderResult> {
    if (this.win) {
      return Promise.resolve({ kind: 'canceled' });
    }

    // 보조 모니터가 있으면 그쪽으로 피한다(pickRecorderPlacement).
    const pill = { w: PILL_WIDTH, h: PILL_HEIGHT };
    const outside = pickRecorderPlacement(rect, pill, screen.getAllDisplays());
    // 영역 밖에 자리가 없으면(전체화면·큰 창) screencapture 엔진으로 녹화하고 알약을 영역 *안* 에 둔다 —
    // 그 엔진은 보호 창(알약)을 프레임에서 빼 준다. 평소엔 화질 제어가 되는 ffmpeg 를 쓴다.
    const engine: RecordEngine = outside.hidden ? 'screencapture' : 'ffmpeg';
    const placement = outside.hidden ? placeInsideBottom(rect, pill) : outside;
    const win = createPillWindow(placement);
    this.win = win;
    this.hidden = placement.hidden;
    if (is.dev) console.info(`[asis video] 녹화 엔진 ${engine}`);

    forwardRendererConsole(win);
    loadRendererPage(win, 'video-recorder').catch((err: unknown) => {
      console.error('[asis] videoRecorderWindow load failed', err);
    });

    return new Promise<VideoRecorderResult>((resolve) => {
      let settled = false;
      // 정지 이후(저장 다이얼로그 포함)에는 취소를 받지 않는다 — ESC·취소가 새면 알약은 닫히고
      // 다이얼로그만 남는다.
      let ending = false;
      const settle = (result: VideoRecorderResult): void => {
        if (settled) return;
        settled = true;
        ipcMain.removeAllListeners(CHANNEL_STOP);
        ipcMain.removeAllListeners(CHANNEL_CANCEL);
        esc.release();
        this.recorder.onEarlyExit = null;
        if (!win.isDestroyed()) win.close();
        this.win = null;
        resolve(result);
      };
      const cancelAndSettle = (): void => {
        if (ending) return;
        ending = true;
        this.recorder.cancel()
          .catch((err: unknown) => {
            console.warn('[asis] video recorder cancel failed', err);
          })
          .finally(() => {
            settle({ kind: 'canceled' });
          });
      };

      // ESC 글로벌 — 알약이 hidden 이거나 focus 못 받는 케이스에도 취소 가능.
      const esc = claimEsc(cancelAndSettle);
      ipcMain.once(CHANNEL_CANCEL, cancelAndSettle);
      win.on('closed', cancelAndSettle);
      // 녹화 도중 ffmpeg 가 스스로 죽으면(권한 거부·잘못된 crop 등) 정지를 기다리지 않고 바로 실패로 끝낸다.
      this.recorder.onEarlyExit = (error): void => {
        if (ending) return;
        ending = true;
        // 일부만 기록된 .mov 와 earlyExit 흔적을 정리한 뒤 실패로 끝낸다(남기면 tmp 누수 +
        // 다음 녹화의 "시작 중 정지" 가 지난 실패로 보고된다).
        this.recorder.cancel()
          .catch((err: unknown) => {
            console.warn('[asis] video recorder early-exit cleanup failed', err);
          })
          .finally(() => {
            settle({ kind: 'failed', error });
          });
      };

      // [perf] 콜드스타트 진단 — ffmpeg 첫 spawn(디스크 캐시 미적재) 지연 여부 확인용.
      const startAt = Date.now();
      this.recorder.start(rect, engine).then(() => {
        log.info(`[perf] video 녹화 시작 +${String(Date.now() - startAt)}ms`);
      }).catch((err: unknown) => {
        // 이미 취소·정지로 결과가 정해졌다면(시작 대기 중 취소) 보고할 것이 없다.
        if (settled) return;
        console.error('[asis] screen record start failed', err);
        settle({ kind: 'failed', error: toError(err) });
      });

      ipcMain.once(CHANNEL_STOP, () => {
        if (ending) return;
        ending = true;
        // 클릭·키 표시는 정지 순간 끈다 — 녹화 promise 는 저장 다이얼로그 뒤에야 settle 된다(GIF 와 같은 이유).
        inputHighlight.stop();
        recordingRegionOverlay.hide();
        // 저장 다이얼로그가 ESC 를 받도록 전역 ESC 를 먼저 푼다(GIF·스크롤과 같은 결).
        esc.release();
        this.recorder.stop().then(saveRecording).then(settle, (err: unknown) => {
          // 시작 대기 중에 누른 정지 — 녹화된 것이 없으니 실패가 아니라 취소다.
          if (isStartCanceled(err)) {
            settle({ kind: 'canceled' });
            return;
          }
          console.error('[asis] video recorder stop failed', err);
          settle({ kind: 'failed', error: toError(err) });
        });
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

function createPillWindow(placement: { x: number; y: number; hidden: boolean }): BrowserWindow {
  const win = new BrowserWindow({
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    x: placement.x,
    y: placement.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    // 생성과 동시에 show 하면 앱이 활성화돼 녹화 대상 앱이 포커스를 잃거나 전체화면 Space 가
    // 전환된다 — 숨긴 채 만들고 showInactive 로 띄운다. 비활성 창에서도 첫 클릭이 버튼에 닿게.
    show: false,
    acceptFirstMouse: true,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
    },
  });
  configureFloatingWindow(win);
  // 알약이 녹화 영상에 잡히지 않도록 — 캡처 대상에서 제외.
  win.setContentProtection(true);
  if (!placement.hidden) win.showInactive();
  return win;
}

/** renderer console 을 main 터미널로 forward — [asis 로그는 dev 에서만, 그 밖엔 error 만. */
function forwardRendererConsole(win: BrowserWindow): void {
  win.webContents.on('console-message', (details) => {
    const { level, message, lineNumber, sourceId } = details;
    if (message.includes('[asis')) {
      if (is.dev) console.info(`[video-recorder ${level}]`, message);
    } else if (level === 'error' && !message.includes('Autofill')) {
      console.error(`[video-recorder error] ${message} (${sourceId}:${String(lineNumber)})`);
    }
  });
}

/**
 * 녹화된 임시 .mov 를 사용자가 고른 위치로 옮긴다. 저장 다이얼로그를 취소하면 canceled.
 * 복사 실패(권한·디스크 부족)는 임시 파일을 *남긴 채* throw 한다 — 지우고 saved 로 보고하면
 * 녹화가 영구히 사라지는데 알림은 "저장됨"으로 뜬다. 호출측이 failed 로 알린다.
 */
async function saveRecording(videoPath: string): Promise<VideoRecorderResult> {
  // Electron 의 'videos' 경로 키가 macOS 의 ~/Movies 에 매핑된다.
  const defaultPath = join(app.getPath('videos'), `ASIS-${String(Date.now())}.mov`);
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath,
    filters: [{ name: 'QuickTime Movie', extensions: ['mov'] }],
  });
  if (canceled || !filePath) {
    await removeTempFile(videoPath);
    return { kind: 'canceled' };
  }
  try {
    await copyFile(videoPath, filePath);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new UserFacingError(
      tMain().video.errors.saveFailed(videoPath),
      `녹화 파일 복사 실패 ${videoPath} → ${filePath}: ${reason}`,
    );
  }
  await removeTempFile(videoPath);
  return { kind: 'saved', path: filePath };
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
