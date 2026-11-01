import {
  BrowserWindow,
  ipcMain,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent,
} from 'electron';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';

export type ElementAtResult = {
  x: number;
  y: number;
  w: number;
  h: number;
  name?: string;
} | null;

export type ElementAtProvider = (
  event: IpcMainInvokeEvent,
  x: number,
  y: number,
) => ElementAtResult;

let elementAtProvider: ElementAtProvider | null = null;
let elementAtHandlerInstalled = false;

/**
 * capture:element-at 핸들러를 프로세스 전역 1회만 등록하고 provider 를 교체한다.
 *
 * 세션마다 ipcMain.handle/removeHandler 를 반복하면:
 *  (a) 세션 종료 ~ renderer 실제 종료/standby 사이에 도착하는 invoke 가
 *      "No handler registered" 에러를 main 콘솔에 스팸하고,
 *  (b) selection/ruler 오버레이가 서로의 핸들러를 removeHandler 로 지운다.
 * provider 교체 방식은 세션 부재 시 null 응답으로 조용히 처리한다.
 */
export function setElementAtProvider(provider: ElementAtProvider): void {
  if (!elementAtHandlerInstalled) {
    elementAtHandlerInstalled = true;
    ipcMain.handle('capture:element-at', (event, x: number, y: number) =>
      // 세션 없음(provider null) = 오버레이 미표시 상태의 잔여 invoke — null 로 조용히 응답.
      elementAtProvider?.(event, x, y) ?? null);
  }
  elementAtProvider = provider;
}

/** 자기 provider 일 때만 해제 — 다른 세션이 이미 교체했다면 건드리지 않는다. */
export function clearElementAtProvider(provider: ElementAtProvider): void {
  if (elementAtProvider === provider) elementAtProvider = null;
}

/**
 * preload 스크립트 절대 경로.
 * main 번들은 out/main/index.js 단일 파일이라, 어느 윈도우 모듈에서 호출하든
 * __dirname 은 out/main 으로 동일하다 (electron-vite 가 src/main/** 를 한 파일로 번들).
 */
export function preloadPath(): string {
  return join(__dirname, '../preload/index.js');
}

/**
 * renderer 페이지 로드 — dev 에서는 electron-vite dev 서버 URL 로 로드해 HMR 이
 * 동작하고, 프로덕션에서는 out/renderer 빌드 산출물을 로드한다.
 *
 * 기존에는 모든 창이 loadFile 만 사용해서 dev 모드에서도 *마지막 빌드 시점* 의
 * renderer 가 떠 코드 변경이 전혀 반영되지 않았다 (dev 인데 UI 가 옛날인 증상).
 * electron-vite 는 dev 실행 시 ELECTRON_RENDERER_URL 환경변수로 dev 서버 주소를
 * 주입하고, 멀티 페이지 입력은 `<devUrl>/<page>/index.html` 로 서빙된다.
 */
/**
 * 화면 위에 떠 있는 보조 창(선택 오버레이·화면 자·녹화 테두리·카운트다운·녹화 알약) 공통 설정.
 *  - 항상 위 + 모든 Space(전체화면 앱 위 포함)에 표시
 *  - Mission Control 에서 숨김 — 특히 선택 오버레이는 즉시 표시를 위해 투명(opacity 0) 창을
 *    상시 띄워 두므로, 숨기지 않으면 Mission Control 에 빈 "asis" 창으로 보인다.
 * level: 녹화 테두리는 HUD 보다 아래('pop-up-menu'), 나머지는 'screen-saver'.
 */
export function configureFloatingWindow(
  win: BrowserWindow,
  level: 'screen-saver' | 'pop-up-menu' = 'screen-saver',
): void {
  win.setAlwaysOnTop(true, level);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setHiddenInMissionControl(true);
}

/** page-title-updated 를 이미 막은 창 — 같은 창을 다시 로드해도 리스너를 한 번만 단다. */
const titleLockedWindows = new WeakSet<BrowserWindow>();

/**
 * 창 제목은 main 이 i18n 사전으로 정한다(BrowserWindow title 옵션·setTitle).
 * HTML <title> 은 언어를 모르는 고정 문자열이라, 로드되면 영어 UI 에서도 한국어 제목으로
 * 덮어써 버린다 — 덮어쓰기를 막는다.
 */
function lockWindowTitle(win: BrowserWindow): void {
  if (titleLockedWindows.has(win)) return;
  titleLockedWindows.add(win);
  win.on('page-title-updated', (event) => {
    event.preventDefault();
  });
}

export function loadRendererPage(
  win: BrowserWindow,
  page: string,
  query?: Record<string, string>,
): Promise<void> {
  lockWindowTitle(win);
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (is.dev && devUrl) {
    const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
    return win.loadURL(`${devUrl}/${page}/index.html${qs}`);
  }
  return win.loadFile(
    join(__dirname, `../renderer/${page}/index.html`),
    query ? { query } : undefined,
  );
}

/**
 * 싱글턴 윈도우 lifecycle 베이스 — 한 개만 떠 있고, 이미 열려 있으면 focus.
 *
 * 적용 대상: history/settings 처럼 "IPC 는 main 에서 영속 등록, 윈도우는 단순 표시"
 * 패턴 전용. editor/recorder/selection 은 Promise + ready 핸드셰이크 + settle 로직이
 * 있어 이 베이스에 맞지 않는다 — 각자 관리한다 (side-effects.md: Class 가 짐이 되는 경우).
 */
export abstract class SingletonWindowManager {
  protected win: BrowserWindow | null = null;
  /** BrowserWindow 옵션 — webPreferences.preload/sandbox 는 베이스가 채운다. */
  protected abstract readonly windowOptions: BrowserWindowConstructorOptions;
  /** renderer 페이지 디렉토리 이름 (예: 'settings', 'history'). */
  protected abstract readonly page: string;
  /** 로드 실패 로그용 라벨 (예: 'historyWindow'). */
  protected abstract readonly logLabel: string;

  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      return;
    }

    const win = new BrowserWindow({
      ...this.windowOptions,
      webPreferences: {
        preload: preloadPath(),
        sandbox: false,
        ...this.windowOptions.webPreferences,
      },
    });
    this.win = win;

    loadRendererPage(win, this.page).catch((err: unknown) => {
      console.error(`[asis] ${this.logLabel} load failed`, err);
    });

    win.on('closed', () => {
      // 이전 창의 closed 가 늦게 오면 그 사이 새로 연 창의 참조를 지우지 않는다.
      if (this.win === win) this.win = null;
    });
  }

  stop(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.close();
    this.win = null;
  }
}
