import { BrowserWindow } from 'electron';
import { join } from 'node:path';

/**
 * 캡처 히스토리 윈도우 lifecycle 관리.
 *
 * IPC 채널(history:list/copy/pin) 은 main/index.ts 에서 영속 등록.
 */
export class HistoryWindowManager {
  private win: BrowserWindow | null = null;

  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      return;
    }

    const win = new BrowserWindow({
      width: 720,
      height: 520,
      title: '캡처 히스토리',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    });
    this.win = win;

    win.loadFile(join(__dirname, '../renderer/history/index.html')).catch((err: unknown) => {
      console.error('[asis] historyWindow loadFile failed', err);
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
