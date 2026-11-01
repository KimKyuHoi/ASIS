import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  screen,
} from 'electron';
import { is } from '@electron-toolkit/utils';
import log from 'electron-log/main';
import { copyFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureFloatingWindow, loadRendererPage, preloadPath } from './common';
import { pickRecorderPlacement, placeInsideBottom, type Placement } from './recorderPlacement';
import { SequenceCaptureManager } from '../capture/sequenceCapture';
import { copyGifToClipboard, nextGifClipboardPath } from '../capture/gifClipboard';
import { settingsStore } from '../settings';
import { claimEsc, type EscClaim } from './escClaim';
import { inputHighlight } from '../input-highlight/inputHighlight';
import { recordingRegionOverlay } from './recordingRegionOverlay';

const CHANNEL_STOP = 'recorder:stop';
const CHANNEL_CANCEL = 'recorder:cancel';
const CHANNEL_GET_FRAME_COUNT = 'recorder:get-frame-count';

const WIN_W = 320;
const WIN_H = 38;

export type RecorderResult =
  | { kind: 'saved'; path: string } |
  { kind: 'copied' } |
  /** after: 'editor' — tmp GIF 경로. 정리 책임은 받는 쪽(gif-studio) 에 있다. */
  { kind: 'encoded'; path: string } |
  { kind: 'canceled' } |
  { kind: 'failed'; error: Error };

export type RecorderShowOptions = {
  /**
   * 인코딩 이후 처리.
   * - save: 저장 다이얼로그 → saved
   * - clipboard: 다이얼로그 없이 클립보드 복사 → copied
   * - editor: 다이얼로그·복사 없이 tmp GIF 경로 반환 → encoded (tmp 안 지움)
   */
  after: 'save' | 'clipboard' | 'editor';
};

type RecorderRect = { x: number; y: number; w: number; h: number };

/** show() 한 번(녹화 한 번) 의 상태. resolve 는 정확히 한 번만 부른다. */
class RecorderSession {
  settled = false;
  /**
   * 이번 녹화의 sequence.start 를 불렀는지. 직전 인코딩을 기다리는 동안에는 GifManager 가
   * *이전* 녹화의 frames 를 쥐고 있어 cancel/stop 을 부르면 이전 인코딩을 망가뜨린다.
   */
  started = false;
  /**
   * sequence.start 가 *끝나* 프레임 캡처 루프가 돌고 있는지. start 는 mkdir 을 await 하므로
   * started 와 capturing 사이에 취소·정지가 끼어들 수 있다 — 그 경우는 start 직후 정리한다.
   */
  capturing = false;
  /**
   * 정지 IPC 이후 — 인코딩·후처리 중. ffmpeg 가 frames 폴더를 읽고 있으므로 취소가 들어와도
   * frames 를 지우지 않고 settle(canceled) 만 한다. 결과 파일은 각 정지 경로가 settled 를 보고 버린다.
   */
  stopping = false;
  /** 이번 녹화가 쥔 전역 ESC — 다른 기능이 쥐고 있었으면 owned=false 라 해제도 하지 않는다. */
  esc: EscClaim | null = null;

  constructor(
    readonly win: BrowserWindow,
    readonly opts: RecorderShowOptions,
    private readonly resolveResult: (result: RecorderResult) => void,
  ) {}

  holdEsc(claim: EscClaim): void { this.esc = claim; }

  markStarted(): void {
    this.started = true;
  }

  /** await 너머의 재확인용 — 필드 직접 접근은 TS 가 await 전 narrowing 을 유지해 버린다. */
  isSettled(): boolean {
    return this.settled;
  }

  markCapturing(): void {
    this.capturing = true;
  }

  markStopping(): void {
    this.stopping = true;
  }

  /** 처음 한 번만 resolve 하고 true. 이미 끝났으면 false. */
  resolve(result: RecorderResult): boolean {
    if (this.settled) return false;
    this.settled = true;
    this.resolveResult(result);
    return true;
  }
}

export class RecorderWindowManager {
  private win: BrowserWindow | null = null;
  private readonly sequence = new SequenceCaptureManager();
  /**
   * 직전 녹화의 인코딩 완료 시점. 인코딩 중 취소하면 창은 바로 닫히지만 GifManager 는
   * 아직 이전 frames 폴더를 쥐고 있어, 곧바로 재녹화하면 start() 가 "이미 녹화 중" 으로 실패한다.
   * 새 녹화는 이 promise 가 끝난 뒤 시작한다. 인코딩 중이 아니면 null.
   */
  private encoding: Promise<void> | null = null;

  /**
   * 시작 시 hidden 으로 떠있는지 (rect 가 화면 거의 전체) 외부에서 알 수 있도록.
   * main/index.ts 가 그 경우 시작 알림으로 단축키 안내.
   */
  isHidden(): boolean {
    return this.hidden;
  }

  private hidden = false;

  show(rect: RecorderRect, opts: RecorderShowOptions): Promise<RecorderResult> {
    if (this.win) {
      return Promise.resolve({ kind: 'canceled' });
    }

    // 알약 위치 fitting — rect 와 안 겹치는 가장자리, 없으면 보조 모니터.
    // 그래도 없으면(단일 모니터 전체화면) 숨기지 않고 영역 *안* 하단에 띄운다 — GIF 는
    // screencapture 로 찍으므로 contentProtection 알약이 프레임에 안 찍힌다(recorderPlacement 실측).
    const outside = pickRecorderPlacement(rect, { w: WIN_W, h: WIN_H }, screen.getAllDisplays());
    const placement = outside.hidden ? placeInsideBottom(rect, { w: WIN_W, h: WIN_H }) : outside;
    const win = createRecorderWindow(placement);
    this.win = win;
    this.hidden = placement.hidden;

    return new Promise<RecorderResult>((resolve) => {
      const session = new RecorderSession(win, opts, resolve);
      this.bindSession(session);
      this.startWhenIdle(session, rect);
    });
  }

  private bindSession(session: RecorderSession): void {
    // ESC 글로벌 — 알약이 hidden 이거나 focus 못 받는 케이스에도 취소 가능.
    session.holdEsc(claimEsc(() => {
      this.cancel(session);
    }));
    ipcMain.handle(CHANNEL_GET_FRAME_COUNT, () => this.sequence.count());
    ipcMain.once(CHANNEL_STOP, () => {
      this.onStop(session);
    });
    ipcMain.once(CHANNEL_CANCEL, () => {
      this.cancel(session);
    });
    session.win.on('closed', () => {
      this.cancel(session);
    });
  }

  private startWhenIdle(session: RecorderSession, rect: RecorderRect): void {
    const gifFps = settingsStore.get('misc').gifFps;
    // [perf] 콜드스타트 진단 — 시퀀스 캡처 시작 지연 확인용.
    const startAt = Date.now();
    const previousEncoding = this.encoding ?? Promise.resolve();
    previousEncoding.then(async () => {
      // 기다리는 사이 취소됐으면 시작하지 않는다 — 시작하면 창 없이 캡처 루프만 돈다.
      if (session.settled) return;
      session.markStarted();
      await this.sequence.start({ rect, fps: gifFps });
      // start 의 await 사이에 취소·정지로 끝났으면 방금 켜진 캡처 루프를 끈다 —
      // 안 끄면 창 없이 screencapture 가 계속 돌고 다음 녹화가 "이미 녹화 중" 으로 실패한다.
      if (session.isSettled()) {
        await this.sequence.cancel();
        return;
      }
      session.markCapturing();
      log.info(`[perf] GIF 녹화 시작 +${Date.now() - startAt}ms`);
    }).catch((err: unknown) => {
      console.error('[asis] sequence start failed', err);
      this.fail(session, err);
    });
  }

  private settle(session: RecorderSession, result: RecorderResult): void {
    if (session.settled) return;
    ipcMain.removeAllListeners(CHANNEL_STOP);
    ipcMain.removeAllListeners(CHANNEL_CANCEL);
    ipcMain.removeHandler(CHANNEL_GET_FRAME_COUNT);
    session.esc?.release();
    if (!session.win.isDestroyed()) session.win.close();
    this.win = null;
    session.resolve(result);
  }

  private fail(session: RecorderSession, err: unknown): void {
    this.settle(session, {
      kind: 'failed',
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }

  private cancel(session: RecorderSession): void {
    const discardFrames = session.started && !session.stopping
      ? this.sequence.cancel()
      : Promise.resolve();
    discardFrames.then(
      () => {
        this.settle(session, { kind: 'canceled' });
      },
      (err: unknown) => {
        console.warn('[asis] recorder cancel failed', err);
        this.settle(session, { kind: 'canceled' });
      },
    );
  }

  private onStop(session: RecorderSession): void {
    if (!session.capturing) {
      // 이전 인코딩 대기 중이거나 start 가 아직 안 끝난 정지 — 찍힌 프레임이 없으므로 취소로 끝낸다.
      // start 진행 중이었다면 startWhenIdle 이 settled 를 보고 루프를 정리한다.
      this.settle(session, { kind: 'canceled' });
      return;
    }
    session.markStopping();
    // 클릭·키 표시는 정지를 누른 순간 끈다. 녹화 promise 는 인코딩·저장 다이얼로그가 끝나야
    // settle 되므로 index.ts 의 finally 만으로는 다이얼로그에서 누른 ⌘V 까지 배지로 뜬다.
    // 녹화 영역 테두리도 같은 이유로 여기서 내린다 — 녹화는 끝났는데 다이얼로그 내내 남지 않게.
    inputHighlight.stop();
    recordingRegionOverlay.hide();
    // 인코딩·저장 다이얼로그 중 ESC 를 전역으로 먹지 않는다 — 다이얼로그의 ESC 가
    // 녹화 취소로 새면 창은 닫히고 다이얼로그만 남는다.
    session.esc?.release();
    if (!session.win.isDestroyed()) {
      session.win.webContents.send('recorder:encoding');
    }
    const finishers: Record<RecorderShowOptions['after'], () => Promise<void>> = {
      save: () => this.stopAndSave(session),
      clipboard: () => this.stopAndCopy(session),
      editor: () => this.stopAndHandOff(session),
    };
    finishers[session.opts.after]().catch((err: unknown) => {
      console.error('[asis] recorder stop failed', err);
      this.fail(session, err);
    });
  }

  /** 저장 모드 — tmp 에 인코딩 후 저장 다이얼로그로 고른 위치에 복사. tmp 는 항상 지운다. */
  private async stopAndSave(session: RecorderSession): Promise<void> {
    const gifPath = await this.encodeOrDiscard(newTmpGifPath());
    try {
      if (session.settled) return;
      const result = await dialog.showSaveDialog({
        defaultPath: join(app.getPath('pictures'), `ASIS-${Date.now()}.gif`),
        filters: [{ name: 'GIF', extensions: ['gif'] }],
      });
      if (result.canceled || !result.filePath) {
        this.settle(session, { kind: 'canceled' });
        return;
      }
      await copyFile(gifPath, result.filePath);
      this.settle(session, { kind: 'saved', path: result.filePath });
    } finally {
      await discardGif(gifPath);
    }
  }

  /**
   * 클립보드 모드 — 인코딩 결과를 클립보드 전용 폴더에 바로 쓴다.
   * 파일 URL 로 붙여넣기 되므로 tmp 처럼 즉시 unlink 하지 않는다 (정리는 gifClipboard).
   * 인코딩 중 취소됐거나 복사가 실패하면 결과 파일을 지운다.
   */
  private async stopAndCopy(session: RecorderSession): Promise<void> {
    const gifPath = await this.encodeOrDiscard(await nextGifClipboardPath());
    if (session.settled) {
      await discardGif(gifPath);
      return;
    }
    try {
      await copyGifToClipboard(gifPath);
    } catch (err) {
      await discardGif(gifPath);
      throw err;
    }
    this.settle(session, { kind: 'copied' });
  }

  /** 에디터 모드 — 인코딩만 하고 tmp 경로를 넘긴다. tmp 정리는 받는 쪽 책임. */
  private async stopAndHandOff(session: RecorderSession): Promise<void> {
    const gifPath = await this.encodeOrDiscard(newTmpGifPath());
    // 인코딩 중 취소 — 넘겨받을 쪽이 없으므로 여기서 지운다.
    if (session.settled) {
      await discardGif(gifPath);
      return;
    }
    this.settle(session, { kind: 'encoded', path: gifPath });
  }

  /** 인코딩 실패 시 ffmpeg 가 남긴 부분 파일을 지우고 에러를 그대로 올린다. */
  private async encodeOrDiscard(outputPath: string): Promise<string> {
    try {
      return await this.encode(outputPath);
    } catch (err) {
      await discardGif(outputPath);
      throw err;
    }
  }

  /** sequence.stop 래퍼 — 인코딩이 끝날 때까지 this.encoding 으로 다음 녹화 시작을 막는다. */
  private encode(outputPath: string): Promise<string> {
    const result = this.sequence.stop(outputPath);
    // 성공·실패 무관하게 "끝났다" 만 알리면 된다 — 실패 처리는 result 를 받는 호출부 몫.
    // clear 는 done 이 resolve 되기 직전에 돌므로, done 을 기다린 쪽은 encoding 이 비워진 뒤 깨어난다.
    const clear = (): void => {
      if (this.encoding === done) this.encoding = null;
    };
    const done = result.then(clear, clear);
    this.encoding = done;
    return result;
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

function createRecorderWindow(placement: Placement): BrowserWindow {
  const win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: placement.x,
    y: placement.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    // 생성 시 show 하면 알약이 key window 가 돼 녹화 중인 앱의 포커스를 뺏고,
    // 전체화면 Space 전환을 유발할 수 있다 — show: false 후 showInactive 로 띄운다.
    show: false,
    // 비활성 창이라 첫 클릭이 활성화로만 소비되지 않게 — 정지/취소 버튼이 한 번에 눌려야 한다.
    acceptFirstMouse: true,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
    },
  });
  configureFloatingWindow(win);
  win.setContentProtection(true);
  // hidden 이면 알약을 안 띄운다 (알림·트레이로 정지 안내).
  if (!placement.hidden) win.showInactive();

  win.webContents.on('console-message', (event) => {
    const { level, message, lineNumber, sourceId } = event;
    if (message.includes('[asis')) {
      if (is.dev) console.info(`[recorder ${level}]`, message);
    } else if (level === 'error' && !message.includes('Autofill')) {
      console.error(`[recorder error] ${message} (${sourceId}:${lineNumber})`);
    }
  });

  loadRendererPage(win, 'recorder').catch((err: unknown) => {
    console.error('[asis] recorderWindow load failed', err);
  });
  return win;
}

function newTmpGifPath(): string {
  return join(tmpdir(), `asis-gif-${Date.now()}.gif`);
}

async function discardGif(path: string): Promise<void> {
  await unlink(path).catch((err: unknown) => {
    if (!isEnoent(err)) console.warn('[asis] gif discard failed', path, err);
  });
}

function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
