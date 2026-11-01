import {
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import log from 'electron-log/main';
import { rmSync, unlinkSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRendererPage, preloadPath } from './common';
import { UserFacingError, userMessageOf } from '../userFacingError';
import { FfmpegCanceledError, FfmpegJob } from '../gif-studio/ffmpeg';
import { isEnoent, removeFile, runExport, type ExportSession } from '../gif-studio/exportTarget';
import {
  confirmDiscard,
  confirmReplace,
  hasUnsavedEdits,
  preserveRecording,
  untilClosed,
} from '../gif-studio/replaceGuard';
import { buildPreview } from '../gif-studio/preview';
import { GIF_EXTENSIONS, VIDEO_EXTENSIONS, mediaKindOf, probeMedia } from '../gif-studio/probe';
import { tGifStudio } from '../gif-studio/strings';
import type {
  GifExportRequest,
  GifExportResult,
  GifStudioMedia,
  GifStudioPreview,
  GifStudioSource,
} from '../gif-studio/types';
import { hiddenWindows } from './hiddenWindows';

const CHANNEL_MEDIA = 'gif-studio:media';
const CHANNEL_GET_MEDIA = 'gif-studio:get-media';
const CHANNEL_LOAD_PREVIEW = 'gif-studio:load-preview';
const CHANNEL_PICK = 'gif-studio:pick';
const CHANNEL_EXPORT = 'gif-studio:export';
const CHANNEL_CANCEL_EXPORT = 'gif-studio:cancel-export';
const CHANNEL_REVEAL = 'gif-studio:reveal';
const CHANNEL_CLOSE = 'gif-studio:close';

type IpcEvent = IpcMainInvokeEvent | IpcMainEvent;

/**
 * GIF 스튜디오 창 — 녹화 직후 GIF 편집, .gif 뷰어, 영상 → GIF 변환을 한 창에서.
 *
 * SingletonWindowManager(common.ts) 를 쓰지 않는 이유: 창이 "지금 어떤 파일을
 * 열고 있는가" 와 그 파일·미리보기 tmp·ffmpeg 프로세스 lifecycle 을 함께 소유해야
 * 해서다. IPC 는 생성자에서 1회 영속 등록하고, 요청한 webContents 가 이 창일
 * 때만 응답한다.
 *
 * tmp 정리 규칙
 *   - 미리보기 자원(proxy.mp4·strip.png·overlay.png·클립보드용 출력) 은 미디어마다
 *     만드는 workDir 안에만 두고, 미디어 교체·창 닫힘 시 폴더째 지운다.
 *   - deleteOnClose 원본(녹화 직후 tmp GIF) 은 교체·창 닫힘 시 지운다.
 */
export class GifStudioWindowManager {
  private win: BrowserWindow | null = null;
  private media: GifStudioMedia | null = null;
  private workDir: string | null = null;
  /** 실행 중인 미리보기 ffmpeg — 미디어가 바뀌면 죽인다. 없으면 null. */
  private previewJob: FfmpegJob | null = null;
  /**
   * 진행 중인 미리보기 요청의 취소 표식. 미리보기는 ffmpeg 를 두 단계(proxy → strip)로 돌려서,
   * 단계 사이(child 없음)에 들어온 취소는 job.cancel() 만으로는 놓친다. 없으면 null.
   */
  private previewRun: { canceled: boolean } | null = null;
  private readonly exportJob = new FfmpegJob();
  /** 진행 중인 내보내기 — 다이얼로그·overlay 쓰기 등 ffmpeg spawn 전 단계도 포함. 없으면 null. */
  private exportRun: { canceled: boolean } | null = null;
  /** open() 직렬화 체인 — 겹친 open 이 세션·창을 꼬지 않게 한 번에 하나씩 처리한다. */
  private openChain: Promise<void> = Promise.resolve();
  /**
   * 닫기 확인 또는 교체 확인 시트가 떠 있다 — 한 창에 시트를 두 장 붙이지 않는다.
   * 닫기 중 들어온 교체는 묻지 않고 거절(새 녹화는 보존), 교체 확인 중 닫기는 무시한다.
   */
  private sheetOpen = false;

  constructor() {
    this.installIpc();
  }

  /**
   * 미디어를 열거나(창이 없으면 생성) 이미 열린 창의 미디어를 교체한다.
   * probe 실패 시 throw — deleteOnClose 원본은 그때도 지운다 (tmp 누수 방지).
   * app ready 이후에만 호출해야 한다 (BrowserWindow 생성).
   * 호출이 겹치면 앞 호출이 끝난 뒤 순서대로 처리한다 (마지막 호출이 최종 미디어).
   */
  open(source: GifStudioSource): Promise<void> {
    const run = this.openChain.then(() => this.openNow(source));
    // 체인은 실패해도 다음 open 을 막지 않는다 — 실패는 run 으로 호출자에게 그대로 간다.
    this.openChain = run.catch(() => undefined);
    return run;
  }

  private async openNow(source: GifStudioSource): Promise<void> {
    let media: GifStudioMedia;
    try {
      const kind = mediaKindOf(source.path);
      if (kind !== source.kind) {
        throw new Error(`gifStudioWindow.open — kind(${source.kind}) 와 확장자(${kind}) 불일치`);
      }
      // 이미 열려 있는 파일(Finder 에서 다시 열기 등) — 세션을 바꾸지 않고 창만 앞으로.
      // 교체하면 진행 중인 내보내기가 말없이 취소된다.
      if (this.focusIfAlreadyOpen(source.path)) return;
      media = await probeMedia(source.path, source.deleteOnClose);
      if (!(await this.mayReplace(source))) return;
      await this.replaceMedia(media);
    } catch (err) {
      // probe·확인·작업 폴더 생성 중 실패 — 아직 세션이 소유하지 않은 녹화 tmp 는 여기서 지운다.
      if (source.deleteOnClose) await removeFile(source.path);
      throw err;
    }

    const win = this.win;
    if (win && !win.isDestroyed()) {
      win.webContents.send(CHANNEL_MEDIA, media);
      hiddenWindows.prepareShow(win);
      win.show();
      win.focus();
      return;
    }
    this.createWindow();
  }

  /**
   * 잃을 것(저장 안 한 녹화 tmp·진행 중 내보내기)이 있는 세션을 바꾸기 전에 사용자에게 묻는다.
   * 거절하면 새 녹화는 저장 폴더로 옮겨 보존하고 false.
   */
  private async mayReplace(source: GifStudioSource): Promise<boolean> {
    const win = this.win;
    const current = this.media;
    if (!win || win.isDestroyed() || !current) return true;
    // 닫기 확인 시트가 떠 있다면 그 자체로 잃을 것이 있다(저장 안 한 편집).
    const losing = current.deleteOnClose || this.exportRun !== null || this.isSheetOpen() ||
      await hasUnsavedEdits(win);
    // 상태를 읽는 사이(최대 1.5초) 창이 닫혔으면 잃을 것이 없다.
    if (!losing || win.isDestroyed()) return true;
    if (await this.askReplace(win, source.deleteOnClose)) return true;
    if (source.deleteOnClose) await preserveRecording(source.path);
    // 확인창이 떠 있는 동안 창이 닫혔을 수 있다.
    if (!win.isDestroyed()) win.focus();
    return false;
  }

  /** 메서드로 읽는다 — await 사이에 바뀌는 값이라 지역 좁히기(narrowing)에 맡기지 않는다. */
  private isSheetOpen(): boolean {
    return this.sheetOpen;
  }

  /**
   * 교체 확인 시트. 이미 다른 시트가 떠 있으면(기다리는 사이 닫기 확인이 뜬 경우 포함)
   * 두 번째 시트를 붙이지 않고 false — 새 녹화는 호출자가 보존한다.
   */
  private async askReplace(win: BrowserWindow, incomingIsRecording: boolean): Promise<boolean> {
    if (this.isSheetOpen()) return false;
    this.sheetOpen = true;
    try {
      return await untilClosed(win, confirmReplace(win, incomingIsRecording));
    } finally {
      this.sheetOpen = false;
    }
  }

  private focusIfAlreadyOpen(path: string): boolean {
    const win = this.win;
    if (!win || win.isDestroyed() || this.media?.path !== path) return false;
    hiddenWindows.prepareShow(win);
    win.show();
    win.focus();
    return true;
  }

  /**
   * 파일 선택 다이얼로그로 GIF·영상을 골라 연다 (트레이 "GIF 스튜디오…" · 창의 [다른 파일 열기]).
   * 취소하면 false — 정상 흐름이라 기존 미디어·창은 그대로다.
   * @param parent 창 안에서 부를 때 시트로 붙일 창. 트레이에서는 생략.
   */
  async openWithPicker(parent?: BrowserWindow): Promise<boolean> {
    const t = tGifStudio();
    const options = {
      title: t.openDialogTitle,
      properties: ['openFile' as const],
      filters: [
        { name: t.mediaFilterName, extensions: [...GIF_EXTENSIONS, ...VIDEO_EXTENSIONS] },
      ],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    const path = result.filePaths.at(0);
    if (result.canceled || path === undefined) return false;
    await this.open({ kind: mediaKindOf(path), path, deleteOnClose: false });
    return true;
  }

  /**
   * 앱 종료 — 창 closed 이벤트를 기다리지 않고 바로 정리한다. 종료 직전에는 비동기
   * 정리가 끝나기 전에 프로세스가 내려가 tmp 가 남는 것을 실측했다 (cleanup 은 멱등).
   */
  stop(): void {
    // 앱 종료는 막지 않는다 — destroy 는 beforeunload(저장 안 한 편집 확인)를 건너뛴다.
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.cleanupSession();
  }

  private createWindow(): void {
    const win = new BrowserWindow({
      width: 1120,
      // 주석 타임라인이 들어가 세로가 늘었다 — 미리보기가 너무 작아지지 않게.
      height: 940,
      minWidth: 860,
      minHeight: 720,
      show: false,
      title: tGifStudio().windowTitle,
      // 첫 페인트 전 깜빡임 방지 — 토큰 --bg-window(라이트 #ffffff / 다크 #1e1e1e)와 맞춘다.
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
      webPreferences: {
        preload: preloadPath(),
        sandbox: false,
      },
    });
    hiddenWindows.hideOnMinimize(win);
    this.win = win;
    // index.html 의 <title>(한국어 고정)이 창 제목을 덮지 않게 — 제목은 현재 언어로 main 이 정한다.
    win.on('page-title-updated', (event) => {
      event.preventDefault();
    });
    // 렌더러가 저장하지 않은 프레임 편집이 있으면 beforeunload 로 닫기를 막는다 — 빨간 닫기 버튼·
    // ESC·[닫기] 모두 여기로 온다. 닫기는 일단 막힌 채 두고(preventDefault 안 함) 비동기 시트로 묻는다.
    // [저장하지 않고 닫기] 면 destroy — beforeunload 를 다시 거치지 않고 closed 정리는 그대로 돈다.
    win.webContents.on('will-prevent-unload', () => {
      // 교체 확인 시트가 떠 있으면 닫기는 무시 — 그 시트에 답한 뒤 다시 닫으면 된다.
      if (this.sheetOpen) return;
      this.sheetOpen = true;
      confirmDiscard(win).then((discard) => {
        if (discard && !win.isDestroyed()) win.destroy();
      }).catch((err: unknown) => {
        log.error('[asis] gifStudio 닫기 확인 실패', err);
      }).finally(() => {
        this.sheetOpen = false;
      });
    });
    win.once('ready-to-show', () => {
      hiddenWindows.prepareShow(win);
      win.show();
      win.focus();
    });
    win.on('closed', () => {
      // 이미 다른 창으로 바뀐 뒤의 closed 가 살아 있는 세션을 지우지 않게.
      if (this.win !== win) return;
      this.win = null;
      this.cleanupSession();
    });
    loadRendererPage(win, 'gif-studio').catch((err: unknown) => {
      log.error('[asis] gifStudioWindow load failed', err);
    });
  }

  private async replaceMedia(next: GifStudioMedia): Promise<void> {
    // 같은 파일 재열기는 openNow 의 focusIfAlreadyOpen 이 먼저 걸러서 여기 오지 않는다 —
    // 그래서 cleanupSession 이 지우는 이전 녹화 tmp 와 next 는 항상 다른 파일이다.
    // 새 작업 폴더를 먼저 만든 뒤 교체 — 실패하면 기존 세션이 그대로 남는다.
    const workDir = await mkdtemp(join(tmpdir(), 'asis-gif-studio-'));
    this.cleanupSession();
    this.media = next;
    this.workDir = workDir;
  }

  /**
   * 미리보기 프로세스·작업 폴더·deleteOnClose 원본 정리. 내보내기 중이면 그것도 죽인다.
   * 동기 — 창을 닫자마자 앱이 종료돼도 tmp 가 남지 않게 (작은 tmp 폴더 하나라 블로킹은 짧다).
   */
  private cleanupSession(): void {
    this.cancelPreview();
    this.cancelExport();
    const media = this.media;
    const workDir = this.workDir;
    this.media = null;
    this.workDir = null;
    // 둘은 따로 시도한다 — 폴더 정리 실패가 녹화 tmp 원본 삭제를 막지 않게.
    if (workDir) safeSync(() => rmSync(workDir, { recursive: true, force: true }));
    if (media?.deleteOnClose) safeSync(() => unlinkSync(media.path));
  }

  /** spawn 전 단계(다이얼로그·overlay 쓰기)의 내보내기도 취소되도록 표식 + ffmpeg kill. */
  private cancelExport(): void {
    if (this.exportRun) this.exportRun.canceled = true;
    this.exportJob.cancel();
  }

  /** 요청이 이 창에서 왔는지 확인. 아니면 throw. */
  private requireWindow(event: IpcEvent): BrowserWindow {
    const win = this.win;
    if (!win || win.isDestroyed() || event.sender !== win.webContents) {
      throw new Error('gif-studio IPC — GIF 스튜디오 창이 아닌 곳에서 호출됐다.');
    }
    return win;
  }

  /** 이 창의 요청 + 열린 미디어가 있어야 하는 IPC 용. */
  private requireSession(event: IpcEvent): Omit<ExportSession, 'isCanceled'> {
    const win = this.requireWindow(event);
    if (!this.media || !this.workDir) {
      throw new Error('gif-studio IPC — 열린 미디어가 없다.');
    }
    return { win, media: this.media, workDir: this.workDir };
  }

  private installIpc(): void {
    ipcMain.handle(CHANNEL_GET_MEDIA, (event): GifStudioMedia | null => {
      this.requireWindow(event);
      return this.media;
    });
    // 렌더러가 에러 문구를 화면에 그대로 띄우는 채널 — userMessageOf 로 바꿔 보낸다.
    ipcMain.handle(CHANNEL_LOAD_PREVIEW, (event, path: string) =>
      forRenderer(CHANNEL_LOAD_PREVIEW, () => this.loadPreview(event, path)));
    ipcMain.handle(CHANNEL_PICK, (event) => forRenderer(CHANNEL_PICK, () => this.pick(event)));
    ipcMain.handle(CHANNEL_EXPORT, (event, request: GifExportRequest) =>
      forRenderer(CHANNEL_EXPORT, () => this.export(event, request)));
    ipcMain.handle(CHANNEL_CANCEL_EXPORT, (event) => {
      this.requireWindow(event);
      this.cancelExport();
    });
    ipcMain.handle(CHANNEL_REVEAL, (event, path: string) => {
      this.requireWindow(event);
      shell.showItemInFolder(path);
    });
    ipcMain.on(CHANNEL_CLOSE, (event) => {
      // ipcMain.on 리스너의 throw 는 main 의 uncaught exception 이 된다 — 로그로 남긴다.
      const win = this.win;
      if (!win || win.isDestroyed() || event.sender !== win.webContents) {
        log.error('[asis] gif-studio:close — GIF 스튜디오 창이 아닌 곳에서 호출됐다.');
        return;
      }
      win.close();
    });
  }

  private loadPreview(event: IpcEvent, path: string): Promise<GifStudioPreview> {
    const { media, workDir } = this.requireSession(event);
    if (path !== media.path) {
      throw new Error(`gif-studio:load-preview — 지금 열린 미디어가 아니다: ${path}`);
    }
    // 이전 미리보기가 아직 돌고 있으면 (빠른 파일 교체) 버린다.
    this.cancelPreview();
    const run = { canceled: false };
    this.previewRun = run;
    return buildPreview(() => {
      // 단계 사이에 취소됐으면 다음 ffmpeg 를 띄우지 않는다 (지워진 workDir 에 쓰는 고아 방지).
      if (run.canceled) throw new FfmpegCanceledError();
      const job = new FfmpegJob();
      // 추적 대상은 현재 요청의 job 만 — 늦게 끝난 이전 요청이 덮어쓰지 않게.
      if (this.previewRun === run) this.previewJob = job;
      return job;
    }, media, workDir);
  }

  private cancelPreview(): void {
    if (this.previewRun) this.previewRun.canceled = true;
    this.previewRun = null;
    this.previewJob?.cancel();
    this.previewJob = null;
  }


  private pick(event: IpcEvent): Promise<boolean> {
    return this.openWithPicker(this.requireWindow(event));
  }

  private async export(event: IpcEvent, request: GifExportRequest): Promise<GifExportResult> {
    const session = this.requireSession(event);
    // 진입 즉시 표식 — await 사이로 두 번째 요청이 끼어들지 못하게.
    if (this.exportRun) throw new Error('gif-studio:export — 이미 내보내는 중이다.');
    const run = { canceled: false };
    this.exportRun = run;
    try {
      const isCanceled = (): boolean => run.canceled;
      return await runExport(this.exportJob, { ...session, isCanceled }, request);
    } finally {
      if (this.exportRun === run) this.exportRun = null;
    }
  }
}

/**
 * IPC 응답 에러를 사용자 문구로 바꾼다 — 원문(ffmpeg stderr·개발자 메시지)은 로그에만.
 * 렌더러는 이 문구를 알림·오류 줄에 그대로 쓴다. 이전 미리보기 취소는 렌더러가 버리므로 그대로 통과.
 */
async function forRenderer<T>(channel: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (err) {
    if (err instanceof FfmpegCanceledError) throw err;
    const detail = err instanceof UserFacingError ? err.detail : undefined;
    log.error(`[asis] ${channel} 실패`, err, detail ?? '');
    throw new Error(userMessageOf(err));
  }
}

/** 정리 실패가 창 닫기·종료를 막지 않게 로그만. 이미 없는 파일(ENOENT)은 정상. */
function safeSync(action: () => void): void {
  try {
    action();
  } catch (err) {
    if (!isEnoent(err)) log.warn('[asis] gifStudio cleanup failed', err);
  }
}
