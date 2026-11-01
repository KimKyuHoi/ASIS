import { BrowserWindow, ipcMain, screen } from 'electron';
import { is } from '@electron-toolkit/utils';
import { HOTKEY_DISABLED } from '../../shared/editor-hotkeys';
import type { PinClickThroughState, PinLoadPayload } from '../../shared/pin';
import { loadHotkeys, loadMisc } from '../settings';
import { loadRendererPage, preloadPath } from './common';

const CHANNEL_LOAD_IMAGE = 'pin:load-image';
const CHANNEL_READY = 'pin:ready';
const CHANNEL_CLOSE = 'pin:close';
const CHANNEL_SET_SIZE = 'pin:set-size';
const CHANNEL_SET_CLICK_THROUGH = 'pin:set-click-through';
const CHANNEL_CLICK_THROUGH_CHANGED = 'pin:click-through-changed';

/** Electron accelerator → macOS 기호 표기. settings/lib/keyboard-utils 의 toDisplayString 과 같은 규칙. */
function toHotkeyLabel(accelerator: string): string {
  if (accelerator === HOTKEY_DISABLED) return '';
  return accelerator
    .replace('CommandOrControl', '⌘')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .split('+')
    .join('');
}

/**
 * Pin to Screen — 캡처/어노테이션 결과를 *떠있는 작은 윈도우* 로 표시.
 * Snipaste 의 시그니처 기능. transparent + alwaysOnTop + frame:false BrowserWindow.
 *
 * .claude/rules/side-effects.md Class 판별:
 *   "이 객체를 React 없이 단위 테스트로 의미 있게 검증할 수 있는가?" → Yes.
 *   다수 윈도우 lifecycle 관리 + IPC 채널 dispatch — 정확히 Class 가 잘 맞는 케이스.
 *
 * 동시 다수 핀 지원 — Map<webContentsId, BrowserWindow> 로 추적, 각 윈도우 닫힘 시 정리.
 *
 * click-through 상태의 단일 원천은 main 이다 (clickThroughIds). renderer 는 토글을
 * *요청* 만 하고, 실제 상태는 CHANNEL_CLICK_THROUGH_CHANGED 로 돌려받아 그린다 —
 * 트레이/전역 단축키로 일괄 해제해도 핀 화면의 잠금 표시가 어긋나지 않게.
 */
export class PinWindowManager {
  private readonly wins = new Map<number, BrowserWindow>();
  private readonly clickThroughIds = new Set<number>();
  private listenersAttached = false;
  /** click-through 핀 개수가 바뀔 때 호출 — 트레이 메뉴 라벨 갱신용. 미등록이면 null. */
  private onClickThroughCountChange: (() => void) | null = null;

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
    const win = this.createWindow({
      width: logicalW,
      height: logicalH,
      x: Math.round((display.workArea.width - logicalW) / 2 + offset),
      y: Math.round((display.workArea.height - logicalH) / 2 + offset),
    });
    const id = win.webContents.id;

    // renderer 가 ready 보내면 dataURL 송신 — handshake 패턴.
    const onReady = (event: Electron.IpcMainEvent): void => {
      if (event.sender.id !== id) return;
      ipcMain.removeListener(CHANNEL_READY, onReady);
      if (win.isDestroyed()) return;
      const payload: PinLoadPayload = {
        src: dataUrl,
        width: logicalW,
        height: logicalH,
        opacity: loadMisc().pinDefaultOpacity,
      };
      win.webContents.send(CHANNEL_LOAD_IMAGE, payload);
    };
    ipcMain.on(CHANNEL_READY, onReady);

    loadRendererPage(win, 'pin').catch((err: unknown) => {
      console.error('[asis] pinWindow load failed', err);
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
    // closed 이벤트를 기다리지 않고 바로 비운다 — 직후 트레이 "n개" 라벨·일괄 해제 개수가
    // 이미 닫은 핀을 세지 않도록. 이후 closed 핸들러의 delete 는 false 라 중복 알림이 없다.
    if (this.clickThroughIds.size > 0) {
      this.clickThroughIds.clear();
      this.onClickThroughCountChange?.();
    }
  }

  count(): number {
    return this.wins.size;
  }

  /** click-through 상태인 핀 개수 — 트레이 메뉴 "click-through 해제 (n)" 라벨용. */
  clickThroughCount(): number {
    return this.clickThroughIds.size;
  }

  /** click-through 핀 개수 변화 구독 (트레이 refresh). 단일 리스너 — 다시 부르면 교체. */
  setClickThroughCountListener(listener: () => void): void {
    this.onClickThroughCountChange = listener;
  }

  /**
   * 모든 핀의 click-through 일괄 해제. 글로벌 단축키 / 트레이 메뉴에서 호출.
   * click-through 활성 시 그 핀은 클릭을 못 받고, 포커스를 잃으면 키보드도 못 받기
   * 때문에 *외부 채널* 이 사실상 유일한 해제 경로다.
   *
   * @returns 실제로 해제된 핀 개수 (원래 click-through 가 아니던 핀은 세지 않는다).
   */
  disableAllClickThrough(): number {
    const released = [...this.clickThroughIds];
    for (const id of released) {
      const win = this.wins.get(id);
      if (win && !win.isDestroyed()) this.applyClickThrough(win, false);
    }
    return released.length;
  }

  private createWindow(bounds: Electron.Rectangle): BrowserWindow {
    const win = new BrowserWindow({
      ...bounds,
      // 핀의 핵심 외양 — 시각적으로 이미지만 떠있는 듯.
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: true,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: preloadPath(),
        sandbox: false,
      },
    });

    const id = win.webContents.id;
    this.wins.set(id, win);

    // renderer console 을 main 터미널로 forward (디버깅 용).
    win.webContents.on('console-message', (details) => {
      const { level, message, lineNumber, sourceId } = details;
      if (message.includes('[asis')) {
        if (is.dev) console.info(`[pin ${level}]`, message);
      } else if (level === 'error' && !message.includes('Autofill')) {
        console.error(`[pin error] ${message} (${sourceId}:${lineNumber})`);
      }
    });

    win.on('closed', () => {
      this.wins.delete(id);
      // click-through 핀이 닫히면 트레이 개수도 줄어야 한다.
      if (this.clickThroughIds.delete(id)) this.onClickThroughCountChange?.();
    });
    return win;
  }

  /**
   * 한 핀의 click-through 를 적용하고 renderer 에 결과를 알린다.
   * forward:true — 클릭은 뒤 윈도우로 통과하지만 mouse move 는 Chromium 으로 전달돼
   * renderer 가 hover(:hover, mouseenter/leave)를 받는다. 잠금 칩의 호버 안내가 이것에 기댄다.
   * (Electron 문서: forward 는 macOS/Windows 전용, ignore=true 일 때만 유효.)
   */
  private applyClickThrough(win: BrowserWindow, enabled: boolean): void {
    const id = win.webContents.id;
    if (enabled) {
      win.setIgnoreMouseEvents(true, { forward: true });
    } else {
      win.setIgnoreMouseEvents(false);
    }
    const changed = enabled ? !this.clickThroughIds.has(id) : this.clickThroughIds.has(id);
    if (enabled) this.clickThroughIds.add(id);
    else this.clickThroughIds.delete(id);

    const state: PinClickThroughState = {
      enabled,
      releaseHotkey: toHotkeyLabel(loadHotkeys().disableClickThrough),
    };
    win.webContents.send(CHANNEL_CLICK_THROUGH_CHANGED, state);
    if (changed) this.onClickThroughCountChange?.();
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

    ipcMain.on(CHANNEL_SET_CLICK_THROUGH, (event, enabled: boolean) => {
      const win = this.wins.get(event.sender.id);
      if (!win || win.isDestroyed()) return;
      this.applyClickThrough(win, enabled);
    });
  }
}
