import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { join } from 'node:path';

/**
 * preload 스크립트 절대 경로.
 * main 번들은 out/main/index.js 단일 파일이라, 어느 윈도우 모듈에서 호출하든
 * __dirname 은 out/main 으로 동일하다 (electron-vite 가 src/main/** 를 한 파일로 번들).
 */
export function preloadPath(): string {
  return join(__dirname, '../preload/index.js');
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
  /** renderer html 의 out/main 기준 상대 경로 (예: '../renderer/history/index.html'). */
  protected abstract readonly htmlPath: string;
  /** loadFile 실패 로그용 라벨 (예: 'historyWindow'). */
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

    win.loadFile(join(__dirname, this.htmlPath)).catch((err: unknown) => {
      console.error(`[asis] ${this.logLabel} loadFile failed`, err);
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
