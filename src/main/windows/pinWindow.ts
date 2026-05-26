import { BrowserWindow, ipcMain, screen } from 'electron';
import { is } from '@electron-toolkit/utils';
import { join } from 'node:path';
import { settingsStore } from '../settings';

const CHANNEL_LOAD_IMAGE = 'pin:load-image';
const CHANNEL_READY = 'pin:ready';
const CHANNEL_CLOSE = 'pin:close';
const CHANNEL_SET_SIZE = 'pin:set-size';
const CHANNEL_SET_CLICK_THROUGH = 'pin:set-click-through';

/**
 * Pin to Screen — 캡처/어노테이션 결과를 *떠있는 작은 윈도우* 로 표시.
 * Snipaste 의 시그니처 기능. transparent + alwaysOnTop + frame:false BrowserWindow.
 *
 * .claude/rules/side-effects.md Class 판별:
 *   "이 객체를 React 없이 단위 테스트로 의미 있게 검증할 수 있는가?" → Yes.
 *   다수 윈도우 lifecycle 관리 + IPC 채널 dispatch — 정확히 Class 가 잘 맞는 케이스.
 *
 * 동시 다수 핀 지원 — Map<webContentsId, BrowserWindow> 로 추적, 각 윈도우 닫힘 시 정리.
 */
export class PinWindowManager {
  private wins = new Map<number, BrowserWindow>();
  private listenersAttached = false;

  pin(dataUrl: string, imgW: number, imgH: number): void {
    if (!this.listenersAttached) {
      this.attachIpcListeners();
      this.listenersAttached = true;
    }

    // 화면 가운데 부근 + 살짝 오프셋 — 다수 핀 띄울 때 겹침 줄이기.
    const display = screen.getPrimaryDisplay();
    // screencapture 는 Retina(2x) 해상도로 저장 → imgW/imgH 는 물리 픽셀.
    // BrowserWindow 크기·위치는 논리 픽셀(CSS px) 단위이므로 scaleFactor 로 나눔.
    const sf = display.scaleFactor || 1;
    const logicalW = Math.round(imgW / sf);
    const logicalH = Math.round(imgH / sf);
    const offset = this.wins.size * 24;
    const x = Math.round((display.workArea.width - logicalW) / 2 + offset);
    const y = Math.round((display.workArea.height - logicalH) / 2 + offset);

    const win = new BrowserWindow({
      width: logicalW,
      height: logicalH,
      x,
      y,
      // 핀의 핵심 외양 — 시각적으로 이미지만 떠있는 듯.
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: true,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    });

    const id = win.webContents.id;
    this.wins.set(id, win);

    // renderer console 을 main 터미널로 forward (디버깅 용).
    win.webContents.on(
      'console-message',
      (_event, level, message, line, sourceId) => {
        if (message.includes('[asis')) {
          if (is.dev) console.info(`[pin L${level}]`, message);
        } else if (level === 3 && !message.includes('Autofill')) {
          console.error(`[pin error] ${message} (${sourceId}:${line})`);
        }
      },
    );

    win.on('closed', () => {
      this.wins.delete(id);
    });

    // renderer 가 ready 보내면 dataURL 송신 — handshake 패턴.
    const onReady = (event: Electron.IpcMainEvent): void => {
      if (event.sender.id !== id) return;
      ipcMain.removeListener(CHANNEL_READY, onReady);
      if (!win.isDestroyed()) {
        const initialOpacity = settingsStore.get('misc').pinDefaultOpacity;
        win.webContents.send(CHANNEL_LOAD_IMAGE, dataUrl, logicalW, logicalH, initialOpacity);
      }
    };
    ipcMain.on(CHANNEL_READY, onReady);

    const pinPath = join(__dirname, '../renderer/pin/index.html');
    win.loadFile(pinPath).catch((err: unknown) => {
      console.error('[asis] pinWindow loadFile failed', err);
    });
  }

  /**
   * 모든 핀 윈도우 닫기.
   */
  closeAll(): void {
    for (const win of this.wins.values()) {
      if (!win.isDestroyed()) win.close();
    }
    this.wins.clear();
  }

  count(): number {
    return this.wins.size;
  }

  /**
   * IPC listeners 는 *모든 핀 윈도우 공통* 으로 등록. 첫 핀 띄울 때만 한 번.
   */
  private attachIpcListeners(): void {
    ipcMain.on(CHANNEL_CLOSE, (event) => {
      const win = this.wins.get(event.sender.id);
      if (win && !win.isDestroyed()) win.close();
    });

    ipcMain.on(CHANNEL_SET_SIZE, (event, w: number, h: number) => {
      const win = this.wins.get(event.sender.id);
      if (!win || win.isDestroyed()) return;
      // 음수·0 방지 + 너무 작으면 hit area 가 사라지니 최소 32 보장.
      const safeW = Math.max(32, Math.round(w));
      const safeH = Math.max(32, Math.round(h));
      win.setSize(safeW, safeH);
    });

    ipcMain.on(
      CHANNEL_SET_CLICK_THROUGH,
      (event, enabled: boolean) => {
        const win = this.wins.get(event.sender.id);
        if (!win || win.isDestroyed()) return;
        // forward:true — 마우스 이벤트가 *뒤 윈도우* 로 통과 + 우리 윈도우는 시각만.
        win.setIgnoreMouseEvents(enabled, { forward: true });
      },
    );
  }

  /**
   * 모든 핀의 click-through 일괄 해제. 글로벌 단축키 / 트레이 메뉴에서 호출.
   * click-through 활성 시 그 핀은 마우스도 키보드도 못 받기 때문에 *외부 채널* 만이
   * 해제 경로다.
   */
  disableAllClickThrough(): void {
    for (const win of this.wins.values()) {
      if (win.isDestroyed()) continue;
      win.setIgnoreMouseEvents(false);
    }
  }
}
