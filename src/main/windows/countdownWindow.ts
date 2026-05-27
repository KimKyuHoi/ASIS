import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

export class CountdownWindow {
  private win: BrowserWindow | null = null;

  show(seconds: number, nearPoint?: { x: number; y: number }): void {
    if (this.win) this.close();

    const size = 100;
    const display = nearPoint
      ? screen.getDisplayNearestPoint(nearPoint)
      : screen.getPrimaryDisplay();
    const { x: dx, y: dy, width, height } = display.bounds;

    const win = new BrowserWindow({
      width: size,
      height: size,
      x: Math.round(dx + (width - size) / 2),
      y: Math.round(dy + height * 0.8),
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: false,
      skipTaskbar: true,
      focusable: false,
      backgroundColor: '#00000000',
      webPreferences: { sandbox: true },
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setContentProtection(true);
    win.setIgnoreMouseEvents(true);

    const countdownPath = join(__dirname, '../renderer/countdown/index.html');
    win.loadFile(countdownPath, { query: { seconds: String(seconds) } }).catch(() => {});

    this.win = win;
    win.on('closed', () => {
      this.win = null;
    });
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close();
    this.win = null;
  }
}
