import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  Notification,
  screen,
} from 'electron';
import { is } from '@electron-toolkit/utils';
import { unlink } from 'node:fs/promises';
import { loadRendererPage, preloadPath } from './common';
import { tMain } from '../i18n/strings';

import {
  registerSessionHandlers,
  unregisterSessionHandlers,
  type EditorResult,
} from './editorSessionIpc';
import { loadImageFile } from '../image-studio/imageFile';
import { loadSource, toLoaded, type LoadedCapture, type SessionSource } from './editorSource';
import type { EditorProjectData } from '../../shared/editor-project';
import { hiddenWindows } from './hiddenWindows';

// 기존 import 경로(index.ts 등) 유지 — 결과 타입은 세션 IPC 쪽에 산다.
export type { EditorResult };

const CHANNEL_LOAD_IMAGE = 'editor:load-image';
const CHANNEL_LOAD_PROJECT = 'editor:load-project';
const CHANNEL_READY = 'editor:ready';

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
  /**
   * 이 매니저가 창에 건 'closed' 리스너 (prewarm 용 또는 세션 용, 한 번에 하나).
   * 교체·정리할 때 이것만 뗀다 — removeAllListeners('closed') 는 hiddenWindows 처럼
   * 다른 모듈이 건 정리 리스너까지 지운다.
   */
  private closedListener: (() => void) | null = null;
  /**
   * 편집 중에 들어온 캡처 아닌 열기 요청(히스토리 [편집]·이미지 스튜디오·Finder 열기) — 지금 세션이
   * 끝나면 순서대로 연다. 지금 세션을 취소하고 열면 작업 중인 주석이 경고 없이 사라지고,
   * Finder 에서 여러 장을 열면 마지막 한 장만 남는다.
   */
  private readonly waiting: (() => void)[] = [];
  /**
   * 이미지 스튜디오가 파일을 읽는 중 — 세션은 아직 없지만 "바쁨" 으로 본다. 그래야 Finder 에서
   * 여러 장을 열 때 먼저 읽기 시작한 것부터 순서대로 열린다(읽기가 먼저 끝난 순이 아니라).
   */
  private loadingImage = false;

  /** PinWindowManager.pin 으로 위임할 콜백 — index.ts 에서 setPinHandler 로 주입. */
  private pinHandler:
    | ((dataUrl: string, w: number, h: number) => void) |
    null = null;

  setPinHandler(handler: (dataUrl: string, w: number, h: number) => void): void {
    this.pinHandler = handler;
  }

  prewarm(): void {
    if (this.stopped || this.win) return;

    const win = new BrowserWindow({
      width: 720,
      height: 480,
      minWidth: 480,
      minHeight: 360,
      title: tMain().windows.editorTitle,
      titleBarStyle: 'hiddenInset',
      // 첫 페인트 전 창 바탕 — renderer 의 --surface-window(design-system tokens.css 의
      // --p-warm-window / --p-warmdark-window)와 같은 값. CSS 변수를 main 이 읽을 수 없어 복제.
      // prewarm 시점 외형으로 정한다 (외형이 바뀌면 renderer CSS 가 곧바로 덮는다).
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1c1a' : '#fffcf8',
      show: false,
      webPreferences: {
        preload: preloadPath(),
        sandbox: false,
      },
    });
    hiddenWindows.hideOnMinimize(win);
    this.win = win;
    this.rendererReady = false;

    // 어노테이션 세션 중 Cmd+R 새로고침 차단 — renderer 가 리셋되면 이미지가 유실되고
    // ready 핸들러가 재등록되지 않아 "캡처를 불러오는 중…" 상태로 멈춘다.
    win.webContents.on('before-input-event', (event, input) => {
      if (this.active && input.type === 'keyDown' && input.meta && input.key === 'r') {
        event.preventDefault();
      }
    });

    win.webContents.on('console-message', (details) => {
      const { level, message, lineNumber, sourceId } = details;
      if (message.includes('[asis')) {
        if (is.dev) console.info(`[renderer ${level}]`, message);
      } else if (level === 'error' && !message.includes('Autofill')) {
        console.error(`[renderer error] ${message} (${sourceId}:${String(lineNumber)})`);
      }
    });

    // validatedURL 까지 받으려면 인자가 4개 — max-params(3) 때문에 rest 튜플로 받는다.
    win.webContents.on(
      'did-fail-load',
      (...[, code, desc, url]: [unknown, number, string, string]) => {
        console.error(
          `[asis] editorWindow did-fail-load code=${String(code)} desc=${desc} url=${url}`,
        );
      },
    );

    loadRendererPage(win, 'editor').catch((err: unknown) => {
      console.error('[asis] editorWindow prewarm load failed', err);
    });

    const onReady = (): void => {
      if (is.dev) console.info('[asis editor:main] prewarm: editor:ready 수신');
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
    this.setClosedListener(win, () => {
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

  /** 캡처 파일을 연다 — 파일은 세션이 끝날 때 지운다(tmp). */
  show(imagePath: string): Promise<EditorResult> {
    return this.open({ kind: 'capture', path: imagePath });
  }

  /** 다시 편집 — 히스토리 [편집]의 편집본(배경 + 도형)을 연다. 지울 tmp 파일은 없다. */
  showProject(project: EditorProjectData): Promise<EditorResult> {
    if (this.isBusy()) return this.enqueue(() => this.showProject(project));
    return this.open({ kind: 'project', project });
  }

  /**
   * 이미지 스튜디오 — 기존 이미지 파일을 연다. 원본 파일은 지우지도 덮어쓰지도 않는다.
   * 읽기 실패는 UserFacingError 로 reject (호출측이 알림·로그).
   */
  async showImageFile(path: string): Promise<EditorResult> {
    // 대기 중에는 파일을 읽지 않는다 — 여러 장을 한꺼번에 열 때 메모리에 다 올리지 않게.
    if (this.isBusy()) return this.enqueue(() => this.showImageFile(path));
    this.loadingImage = true;
    let file: Awaited<ReturnType<typeof loadImageFile>>;
    try {
      file = await loadImageFile(path);
    } catch (err) {
      // 세션을 못 열었다 — 읽는 동안 쌓인 대기열이 멈추지 않게 다음 것을 꺼낸다.
      this.scheduleDrain();
      throw err;
    } finally {
      this.loadingImage = false;
    }
    return this.open({ kind: 'image', loaded: toLoaded(file.dataUrl, file.width, file.height) });
  }

  private isBusy(): boolean {
    return this.active || this.loadingImage;
  }

  /**
   * 대기열에서 다음 요청을 꺼내 연다. 지금 바쁘면(그사이 새 캡처가 세션을 시작했거나 다른 파일을
   * 읽는 중) 꺼내지 않는다 — 순서를 지키고 "대기 n개" 알림이 다시 뜨지 않게, 다음 settle 에서
   * 다시 본다. 여러 번 불려도 바쁨 검사 덕에 한 번에 하나만 시작한다.
   */
  private scheduleDrain(): void {
    setImmediate(() => {
      if (this.isBusy()) return;
      const next = this.waiting.shift();
      if (next) next();
    });
  }

  /** 지금 세션이 끝나면 start 를 부른다. 결과는 start 의 결과 그대로. */
  private enqueue(start: () => Promise<EditorResult>): Promise<EditorResult> {
    return new Promise<EditorResult>((resolve, reject) => {
      this.waiting.push(() => {
        start().then(resolve, (err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
          // 이 요청이 세션을 열지 못했다(파일 삭제·디코드 실패 등) — settle 이 오지 않으니
          // 여기서 다음 것을 꺼낸다. 안 그러면 뒤 요청이 전부 멈춘다.
          this.scheduleDrain();
        });
      });
      new Notification({
        title: tMain().windows.editorTitle,
        body: tMain().editorQueue.waiting(this.waiting.length),
      }).show();
    });
  }

  private open(source: SessionSource): Promise<EditorResult> {
    const imagePath = source.kind === 'capture' ? source.path : null;
    // 캡처가 아닌 출처는 지금 세션을 밀어내지 않는다 (showImageFile 이 파일을 읽는 사이 세션이
    // 시작된 경우도 여기서 걸린다). 새 캡처는 기존처럼 지금 세션을 대신한다.
    if (this.isBusy() && source.kind !== 'capture') return this.enqueue(() => this.open(source));
    if (this.active) {
      if (this.currentSettleFn) {
        // 이전 세션 취소 → active=false, win=null 로 설정됨.
        // 이후 코드가 새 이미지로 세션을 재시작한다.
        this.currentSettleFn({ kind: 'canceled' });
      } else {
        // 방어: settle 함수 없으면 새 파일 정리 후 종료.
        if (imagePath !== null) unlinkCapture(imagePath, 'skip-cleanup');
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

    let capture: LoadedCapture;
    try {
      capture = loadSource(source);
    } catch (err) {
      this.active = false;
      // 세션을 못 열었다 — 대기열이 멈추지 않게 다음 것을 꺼낸다.
      this.scheduleDrain();
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    fitEditorWindow(win);

    const sendImage = (): void => {
      if (!win.isDestroyed()) {
        if (is.dev) console.info(`[asis editor:main] ${source.kind} 전송`);
        if (source.kind === 'project') win.webContents.send(CHANNEL_LOAD_PROJECT, source.project);
        else win.webContents.send(CHANNEL_LOAD_IMAGE, capture.dataUrl, capture.logW, capture.logH);
      }
    };

    return new Promise<EditorResult>((resolve) => {
      let settled = false;
      const settle = (result: EditorResult): void => {
        if (settled) return;
        settled = true;
        this.endSession(win, imagePath);
        resolve(result);
        if (!this.stopped) {
          setImmediate(() => this.prewarm());
          // 대기 중인 열기 요청이 있으면 다음 것 — 없으면(대부분) 아무것도 안 한다.
          this.scheduleDrain();
        }
      };
      this.currentSettleFn = settle;

      registerSessionHandlers({
        win,
        settle,
        sessionKey: `editor-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
        getPinHandler: () => this.pinHandler,
      });

      // prewarm 이 등록한 closed 핸들러를 show 용으로 교체 (다른 모듈의 리스너는 그대로)
      this.setClosedListener(win, () => {
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

      hiddenWindows.prepareShow(win);

      win.show();
      if (process.platform === 'darwin') {
        app.focus({ steal: true });
      }
      win.focus();
      win.moveTop();
    });
  }

  /** 세션 종료 정리 — IPC 핸들러 해제, 창 닫기, 캡처 tmp 삭제. settle 에서 한 번만 호출. */
  private endSession(win: BrowserWindow, imagePath: string | null): void {
    this.active = false;
    this.currentSettleFn = null;
    // 즉시 null — win.close() 는 비동기이므로 closed 이벤트 전에
    // 다음 show() 가 들어오면 닫히는 창을 재사용해 "Object destroyed" 에러 발생.
    this.win = null;
    this.rendererReady = false;
    unregisterSessionHandlers();
    if (this.readyHandler) {
      ipcMain.removeListener(CHANNEL_READY, this.readyHandler);
      this.readyHandler = null;
    }
    this.pendingImageSend = null;
    if (!win.isDestroyed()) {
      // 이 매니저의 closed 리스너만 제거 — 창 닫힘 이벤트가 새 win 을 null 로 덮어쓰는 것 방지.
      this.clearClosedListener(win);
      win.close();
    }
    if (imagePath !== null) unlinkCapture(imagePath, 'tmp cleanup');
  }

  private setClosedListener(win: BrowserWindow, listener: () => void): void {
    this.clearClosedListener(win);
    this.closedListener = listener;
    win.once('closed', listener);
  }

  private clearClosedListener(win: BrowserWindow): void {
    if (this.closedListener) win.removeListener('closed', this.closedListener);
    this.closedListener = null;
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

/**
 * 캡처 크기에 무관한 고정 창 크기 — 화면 비율 기반으로 계산.
 * 이미지는 renderer 의 stageScale 이 창 안에 맞게 fit-scale 한다.
 */
function fitEditorWindow(win: BrowserWindow): void {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const fixedW = Math.min(Math.round(workAreaSize.width * 0.72), 1100);
  const fixedH = Math.min(Math.round(workAreaSize.height * 0.78), 820);
  win.setSize(Math.max(fixedW, 720), Math.max(fixedH, 520));
  win.center();
}

function unlinkCapture(imagePath: string, label: string): void {
  unlink(imagePath).catch((err: unknown) => {
    if (!isFileNotFound(err)) {
      console.error(`[asis] editorWindow ${label} failed`, err);
    }
  });
}

function isFileNotFound(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
