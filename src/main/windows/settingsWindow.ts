import { BrowserWindow } from 'electron';
import { join } from 'node:path';

/**
 * 환경설정 윈도우 lifecycle 관리.
 *
 * 싱글턴 — 이미 열려있으면 focus 만 한다.
 * IPC 채널(settings:get/set) 은 main process 에서 영속 등록하므로 여기서 관리 안 함.
 */
export class SettingsWindowManager {
  private win: BrowserWindow | null = null;

  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      return;
    }

    const win = new BrowserWindow({
      width: 560,
      height: 600,
      title: 'ASIS 환경설정',
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    });
    this.win = win;

    win.loadFile(join(__dirname, '../renderer/settings/index.html')).catch((err: unknown) => {
      console.error('[asis] settingsWindow loadFile failed', err);
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
