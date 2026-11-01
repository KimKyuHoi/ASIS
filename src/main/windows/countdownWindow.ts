import { BrowserWindow, screen } from 'electron';
import { is } from '@electron-toolkit/utils';
import { configureFloatingWindow, loadRendererPage } from './common';

/** 카운트다운 원형 창 한 변(논리 px). */
const SIZE = 100;
/** 화면 위쪽에서 창 상단까지의 비율 — 하단 1/5 지점. */
const TOP_RATIO = 0.8;

/**
 * 지연 캡처 카운트다운 오버레이 — 클릭 통과·포커스 없음·캡처 제외.
 * 한 번에 하나만 띄운다(다시 show 하면 이전 창을 닫는다).
 */
export class CountdownWindow {
  private win: BrowserWindow | null = null;

  show(seconds: number, nearPoint?: { x: number; y: number }): void {
    if (this.win) this.close();

    const display = nearPoint
      ? screen.getDisplayNearestPoint(nearPoint)
      : screen.getPrimaryDisplay();
    const { x: dx, y: dy, width, height } = display.bounds;

    const win = new BrowserWindow({
      width: SIZE,
      height: SIZE,
      x: Math.round(dx + (width - SIZE) / 2),
      y: Math.round(dy + height * TOP_RATIO),
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: false,
      skipTaskbar: true,
      focusable: false,
      backgroundColor: '#00000000',
      // 지연 캡처는 hover·열린 메뉴를 찍으려는 기능 — 앱이 활성화되면 대상 앱의 hover·메뉴가
      // 닫힌다. 숨긴 채 만들고 showInactive 로 띄운다(focusable:false 만으로는 활성화를 못 막을 수 있다).
      show: false,
      webPreferences: { sandbox: true },
    });

    configureFloatingWindow(win);
    win.setContentProtection(true);
    win.setIgnoreMouseEvents(true);
    win.showInactive();

    loadRendererPage(win, 'countdown', { seconds: String(seconds) }).catch((err: unknown) => {
      // 카운트다운 화면 로드 실패 — 오버레이만 안 보일 뿐 실제 캡처는 진행된다.
      if (is.dev) console.warn('[asis] 카운트다운 로드 실패', err);
    });

    this.win = win;
    win.on('closed', () => {
      // close() 는 'closed' 를 나중에 보낸다 — 연속 show 로 이미 새 창이 들어왔으면 지우지 않는다.
      if (this.win === win) this.win = null;
    });
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close();
    this.win = null;
  }
}
