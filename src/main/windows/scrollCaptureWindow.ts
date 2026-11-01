import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  screen,
} from 'electron';
import { is } from '@electron-toolkit/utils';
import log from 'electron-log/main';
import { copyFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureFloatingWindow, loadRendererPage, preloadPath } from './common';
import { pickRecorderPlacement } from './recorderPlacement';
import { ScrollCaptureManager, type ScrollCaptureMode } from '../scroll-capture/scrollCapture';
import { canPostEvents } from '../scroll-capture/scrollEvents';
import { ensureAccessibilityPermission } from '../windowsInfo';
import { recordingRegionOverlay } from './recordingRegionOverlay';
import type { Rect } from '../scroll-capture/frameSource';
import { tMain } from '../i18n/strings';
import { tScroll } from '../scroll-capture/strings';
import { UserFacingError } from '../userFacingError';
import { claimEsc, type EscClaim } from './escClaim';

const CHANNEL_STOP = 'scroll-capture:stop';
const CHANNEL_CANCEL = 'scroll-capture:cancel';
const CHANNEL_GET_PROGRESS = 'scroll-capture:get-progress';
const CHANNEL_DIRECTION = 'scroll-capture:direction';

/** 방향 선택 화면(↑ ↓ 취소 정지 + 문구) 이 들어가는 폭. */
const PILL_W = 420;
const PILL_H = 38;
/** 영역 안쪽에 띄울 때 아래 가장자리와의 간격(pt). */
const INNER_PILL_MARGIN = 24;

export type ScrollCaptureResult =
  /** gaps = 겹침을 못 찾아 그대로 이어붙인 구간 수(0 이 아니면 결과에 빈틈·중복이 있을 수 있다). */
  | { kind: 'saved'; path: string; gaps: number } |
  { kind: 'copied'; gaps: number } |
  { kind: 'canceled' } |
  { kind: 'failed'; error: Error };

/**
 * 스크롤 캡처 알약(floating bar) lifecycle 관리.
 *
 * GIF/영상 recorder 알약과 골격이 동일하다(알약 · settle 단일 종료점 · ESC 취소 ·
 * 진행 polling). 다른 점: 사용자가 스크롤하는 동안 찍은 프레임들을 세로 스티칭해 *한 장의
 * 긴 PNG* 를 만들고, 저장 다이얼로그로 PNG 를 저장한다. 진행 polling 채널은 handle 로
 * 등록하므로 settle 에서 removeHandler 필수.
 *
 * placement 계산은 recorderPlacement 모듈을 recorder 들과 공유한다.
 */
export class ScrollCaptureWindowManager {
  private win: BrowserWindow | null = null;
  private readonly capture = new ScrollCaptureManager();
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
  show(rect: Rect): Promise<ScrollCaptureResult> {
    if (this.win) {
      return Promise.resolve({ kind: 'canceled' });
    }
    // 창을 만들기 전에 정한다 — 판정이 throw 해도 창·this.win 이 남지 않게.
    const mode = decideMode();
    const { win, hidden } = createPillWindow(rect);
    this.win = win;
    this.hidden = hidden;
    forwardRendererConsole(win);
    // 캡처 영역을 녹화와 같은 테두리로 표시 — rect *바깥* 에만 그려 결과에 섞이지 않는다.
    recordingRegionOverlay.show(rect);
    loadRendererPage(win, 'scroll-capture', { mode }).catch((err: unknown) => {
      log.error('[scroll] window load failed', err);
    });

    return new Promise<ScrollCaptureResult>((resolve) => {
      this.runSession(win, { rect, mode }, resolve);
    });
  }

  stop(): void {
    if (!this.win) return;
    recordingRegionOverlay.hide();
    if (!this.win.isDestroyed()) this.win.close();
    this.win = null;
    // 앱 종료 경로에서 불린다 — 비동기 정리는 프로세스가 먼저 끝나 임시 폴더가 남을 수 있어 동기로.
    this.capture.abortSync();
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

  /** IPC·ESC·창 닫힘을 연결하고 캡처를 시작한다. 모든 종료 경로는 settle 하나로 모인다. */
  private runSession(
    win: BrowserWindow,
    opts: { rect: Rect; mode: ScrollCaptureMode },
    resolve: (result: ScrollCaptureResult) => void,
  ): void {
    let settled = false;
    let esc: EscClaim | null = null;
    const settle = (result: ScrollCaptureResult): void => {
      if (settled) return;
      settled = true;
      recordingRegionOverlay.hide();
      ipcMain.removeAllListeners(CHANNEL_STOP);
      ipcMain.removeAllListeners(CHANNEL_CANCEL);
      ipcMain.removeAllListeners(CHANNEL_DIRECTION);
      // 진행 polling 은 handle 로 등록했으므로 반드시 removeHandler.
      ipcMain.removeHandler(CHANNEL_GET_PROGRESS);
      esc?.release();
      if (!win.isDestroyed()) win.close();
      this.win = null;
      resolve(result);
    };
    // 종료 흐름은 취소·정지 중 먼저 온 하나만 탄다.
    //   - 합성·저장 중 취소(ESC 등) 를 받으면 합성은 계속되는데 저장 다이얼로그가 결과 보고 뒤에 뜬다.
    //   - 취소의 정리(await) 중 정지가 오면 빈 세션으로 stop() 이 throw 해 'failed' 가 먼저 보고된다.
    let ending = false;
    const cancelAndSettle = (): void => {
      if (ending) return;
      ending = true;
      this.capture.cancel().then(
        () => {
          settle({ kind: 'canceled' });
        },
        (err: unknown) => {
          log.warn('[scroll] cancel failed', err);
          settle({ kind: 'canceled' });
        },
      );
    };

    // 정지 버튼/Enter/단축키(renderer 경유) 와 캡처의 자체 종료(끝 감지·높이 상한·루프 실패) 가 공유하는 종료 흐름.
    const finish = (): void => {
      if (ending || settled) return;
      ending = true;
      // 합성·저장 단계에서는 영역 표시가 필요 없다 — 저장 다이얼로그 위에 테두리가 남지 않게.
      recordingRegionOverlay.hide();
      // 저장 다이얼로그가 ESC 를 받도록 전역 ESC 를 먼저 푼다(이 시점부터 취소는 no-op).
      esc?.release();
      // 스티칭 시작을 알려 알약을 'stitching' 상태로 전환.
      if (!win.isDestroyed()) win.webContents.send('scroll-capture:stitching');
      this.stitchAndSave().then(settle, (err: unknown) => {
        log.error('[scroll] stop failed', err);
        settle({ kind: 'failed', error: toError(err) });
      });
    };

    // ESC 글로벌 — 알약이 hidden 이거나 focus 못 받는 케이스에도 취소 가능.
    esc = claimEsc(cancelAndSettle);
    ipcMain.handle(CHANNEL_GET_PROGRESS, () => this.capture.progress());
    // 알약의 화살표(↑/↓) — 자동 스크롤 방향. 렌더러 입력이라 값은 검증한다.
    ipcMain.on(CHANNEL_DIRECTION, (_event, direction: unknown) => {
      if (direction !== 'up' && direction !== 'down') {
        log.warn('[scroll] 알 수 없는 방향 IPC 무시', direction);
        return;
      }
      this.capture.startAuto(direction);
    });
    ipcMain.once(CHANNEL_STOP, finish);
    ipcMain.once(CHANNEL_CANCEL, cancelAndSettle);
    win.on('closed', cancelAndSettle);

    // 고정 헤더/푸터는 스티처가 프레임 비교로 자동 검출한다(설정 불필요).
    this.capture.start({ ...opts, onEnd: finish }).catch((err: unknown) => {
      log.error('[scroll] start failed', err);
      settle({ kind: 'failed', error: toError(err) });
    });
  }

  private async stitchAndSave(): Promise<ScrollCaptureResult> {
    const tmpPng = join(tmpdir(), `asis-scroll-${String(Date.now())}.png`);
    // 합성 PNG 쓰기가 도중에 실패해도 부분 파일이 남지 않게 stop 부터 정리 범위 안에 둔다.
    try {
      const report = await this.capture.stop(tmpPng);
      // 캡처 세션이 아직 없었다(시작 준비 중 정지) — 합성할 것이 없으니 취소로 끝낸다.
      if (!report) return { kind: 'canceled' };
      log.info(
        `[scroll] stitched ${String(report.frameCount)} frames -> ${String(report.width)}x${String(report.height)} (confident ${String(report.confidentJoins)}, fallback ${String(report.fallbackJoins)})`,
      );
      return await saveStitchedPng(tmpPng, report.fallbackJoins);
    } finally {
      await unlink(tmpPng).catch((err: unknown) => {
        if (!isEnoent(err)) log.warn('[scroll] tmp cleanup failed', err);
      });
    }
  }
}

/**
 * 손쉬운 사용(이벤트 주입) 권한이 있으면 auto(관례 — 앱이 직접 스크롤), 없으면 권한을 요청하고
 * 이번 캡처는 manual. CoreGraphics 바인딩이 실패해도 manual 로 진행한다(캡처는 된다).
 */
function decideMode(): ScrollCaptureMode {
  let canPost: boolean;
  try {
    canPost = canPostEvents();
  } catch (err) {
    log.error('[scroll] 이벤트 주입 바인딩 실패 — 수동 모드로 진행', err);
    return 'manual';
  }
  if (canPost) return 'auto';
  // 시스템 설정 안내 프롬프트. 결과와 무관하게 이번 캡처는 manual.
  ensureAccessibilityPermission(true);
  return 'manual';
}

/**
 * 알약 창 생성. 전체 디스플레이를 넘긴다 — primary 만 넘기면 보조 모니터의 영역을 캡처할 때
 * 후보 좌표가 전부 primary 밖이라 자리가 남아 있어도 hidden 이 된다.
 */
function createPillWindow(rect: Rect): { win: BrowserWindow; hidden: boolean } {
  const placement = pickRecorderPlacement(rect, { w: PILL_W, h: PILL_H }, screen.getAllDisplays());
  // 영역 밖에 자리가 없으면(창·화면 전체 선택) 숨기지 않고 영역 *안* 하단 가운데에 띄운다.
  // contentProtection 창은 두 캡처 경로 모두에 찍히지 않는다 — screencapture -R(record-region
  // 실측 0/240000px), CGDisplayCreateImageForRect(scroll-capture 실측 0/80000px, 통제군 보호 안 한
  // 창은 78888/80000px). 프레임을 가리지 않으면서 진행 상황과 정지 버튼을 보여 줄 수 있다.
  const pos = placement.hidden
    ? {
      x: Math.round(rect.x + (rect.w - PILL_W) / 2),
      y: Math.round(rect.y + rect.h - PILL_H - INNER_PILL_MARGIN),
    }
    : { x: placement.x, y: placement.y };
  const win = new BrowserWindow({
    width: PILL_W,
    height: PILL_H,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    // 생성 시 show 하면 앱이 활성화돼 전체화면 Space 전환이 일어날 수 있다 — showInactive 로 띄운다.
    show: false,
    // 비활성 창의 첫 클릭이 창 활성화에만 쓰이지 않고 바로 버튼으로 가게(다른 녹화 알약과 동일).
    acceptFirstMouse: true,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
    },
  });
  // 항상 위 · 모든 Space · Mission Control 에서 숨김(빈 "asis" 창이 보이지 않게).
  configureFloatingWindow(win);
  // 알약이 캡처 프레임에 잡히지 않도록 — 캡처 대상에서 제외.
  win.setContentProtection(true);
  win.showInactive();
  if (placement.hidden) log.info('[scroll] 영역 밖에 자리가 없어 알약을 영역 안쪽 하단에 표시');
  return { win, hidden: false };
}

/** Electron 39 의 console-message details 형식 (videoRecorderWindow 와 동일). */
function forwardRendererConsole(win: BrowserWindow): void {
  win.webContents.on('console-message', (details) => {
    const { level, message, lineNumber, sourceId } = details;
    if (message.includes('[asis')) {
      if (is.dev) console.info(`[scroll-capture ${level}]`, message);
    } else if (level === 'error' && !message.includes('Autofill')) {
      log.error(`[scroll-capture renderer] ${message} (${sourceId}:${String(lineNumber)})`);
    }
  });
}

/**
 * 합성된 임시 PNG 를 저장 다이얼로그로 저장. 다이얼로그를 취소하면 클립보드로 복사해 결과를 잃지 않는다.
 * 복사 실패(권한·디스크 부족) 는 'saved' 로 보고하지 않는다 — 결과를 클립보드에 살려 두고 throw 해
 * 호출측이 'failed' 로 알리게 한다(임시 파일은 호출측 finally 에서 지워지므로 여기서 살려야 한다).
 */
async function saveStitchedPng(tmpPng: string, gaps: number): Promise<ScrollCaptureResult> {
  const defaultPath = join(app.getPath('pictures'), `ASIS-scroll-${String(Date.now())}.png`);
  const saveResult = await dialog.showSaveDialog({
    defaultPath,
    filters: [{ name: tMain().scroll.pngFilterName, extensions: ['png'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) {
    const img = nativeImage.createFromPath(tmpPng);
    if (img.isEmpty()) {
      throw new UserFacingError(tScroll().stitchFailed, `합성 PNG 를 읽지 못함 (빈 이미지): ${tmpPng}`);
    }
    clipboard.writeImage(img);
    return { kind: 'copied', gaps };
  }
  try {
    await copyFile(tmpPng, saveResult.filePath);
  } catch (err) {
    log.error('[scroll] png copy failed', err);
    const img = nativeImage.createFromPath(tmpPng);
    if (!img.isEmpty()) clipboard.writeImage(img);
    throw new UserFacingError(tScroll().saveFailed, `scroll png copy 실패: ${String(err)}`);
  }
  return { kind: 'saved', path: saveResult.filePath, gaps };
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && err.code === 'ENOENT';
}
