import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';

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
export function loadRendererPage(
  win: BrowserWindow,
  page: string,
  query?: Record<string, string>,
): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
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
      this.win = null;
    });
  }

  stop(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.close();
    this.win = null;
  }
}
