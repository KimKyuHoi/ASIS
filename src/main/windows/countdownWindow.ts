import { BrowserWindow, screen } from 'electron';
import { is } from '@electron-toolkit/utils';
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
    win.loadFile(countdownPath, { query: { seconds: String(seconds) } }).catch((err: unknown) => {
      // 카운트다운 화면 로드 실패 — 오버레이만 안 보일 뿐 실제 캡처는 진행된다.
      if (is.dev) console.warn('[asis] 카운트다운 로드 실패', err);
    });

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
