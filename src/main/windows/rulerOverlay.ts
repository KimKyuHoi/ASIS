import { BrowserWindow, ipcMain, Notification, screen } from 'electron';
import { is } from '@electron-toolkit/utils';
import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRendererPage, preloadPath } from './common';
import { ensureAccessibilityPermission, getElementBoundsAtPoint } from '../windowsInfo';

/**
 * 화면 자 / 간격 측정 오버레이 — 풀스크린 transparent BrowserWindow lifecycle.
 *
 * 기존 SelectionOverlayManager 와 같은 renderer 엔트리('selection')를 `?mode=ruler`
 * query 로 재사용한다. 캡처 오버레이와의 차이:
 *   - 캡처하지 않는다 — capture:region 핸들러 없음. 결과 Promise 도 필요 없다.
 *   - window 목록(snap) 을 쓰지 않는다 — capture:windows / listWindows 폴링 없음.
 *   - background(Magnifier) + element-at(AX 치수) 만 제공한다.
 *   - ESC 로만 닫힌다(renderer 는 measured 상태를 유지하며 다시 드래그 가능).
 *
 * 별도 매니저로 둔 이유(side-effects.md / common.ts:44 주석):
 *   SelectionOverlayManager.show() 는 캡처 전용 Promise/settle/poll lifecycle 을
 *   갖는다. 여기에 측정 모드를 끼우면 종료 조건이 갈라져 복잡도가 급증한다.
 *   측정은 종료 결과값이 없는 단순 open/close 라 자체 매니저가 더 솔직하다.
 *
 * 룰
 *   - side-effects.md — 시스템 전역 lifecycle 객체는 Class 로 캡슐화.
 *   - null-safety.md — 권한/파일/exit code 를 명시 분기. 빈 catch 없음(이유 명시).
 *   - imperative-style.md — main process 명령형 OK.
 */

const CHANNEL_BACKGROUND = 'capture:background';
const CHANNEL_READY = 'capture:ready';
const CHANNEL_CANCEL = 'capture:cancel';
const CHANNEL_ELEMENT_AT = 'capture:element-at';

export class RulerOverlayManager {
  private win: BrowserWindow | null = null;
  private stopped = false;

  /** 측정 오버레이 열기. 이미 떠 있으면 focus 만(중복 방지). */
  open(): void {
    if (this.stopped) return;
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      return;
    }

    // AX 권한 확인 — 요소 치수 표시에 필요. 없으면 안내 후에도 측정 자체는 동작
    // (거리·눈금은 AX 무관). 권한 없으면 elementAt 이 자연스럽게 null 을 반환한다.
    if (!ensureAccessibilityPermission(false)) {
      ensureAccessibilityPermission(true);
      new Notification({
        title: 'ASIS — 손쉬운 사용 권한 필요',
        body: '시스템 설정에서 ASIS를 허용하면 요소 치수 측정이 활성화됩니다.',
      }).show();
    }

    // 커서가 있는 디스플레이만 덮는다(다중 모니터).
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const minX = display.bounds.x;
    const minY = display.bounds.y;

    const win = createRulerWindow(display.bounds);
    this.win = win;

    if (is.dev) console.info('[asis] rulerOverlay open');

    // ?mode=ruler 로 selection 엔트리를 측정 모드로 로드.
    loadRendererPage(win, 'selection', { mode: 'ruler' }).catch((err: unknown) => {
      console.error('[asis] rulerOverlay load failed', err);
    });

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(`[asis] rulerOverlay did-fail-load code=${code} desc=${desc} url=${url}`);
    });

    // background 캡처를 win.show() 보다 먼저 시작 — overlay dim 이 캡처에 안 찍히도록.
    captureBackgroundForRuler(win).catch((err: unknown) => {
      console.warn('[asis] ruler background 캡처 실패 (magnifier 비활성):', err);
    });

    win.show();
    win.focus();
    win.webContents.focus();
    win.once('ready-to-show', () => {
      // macOS 26β transparent+alwaysOnTop 자동 focus 회귀 우회.
      win.focus();
      win.webContents.focus();
    });

    // AX 요소 치수 조회 — 전역 좌표 ↔ 오버레이 로컬 좌표 변환(캡처 오버레이와 동일).
    // ipcMain.handle 은 동일 채널 중복 등록 시 throw 하므로, 캡처 오버레이가
    // 비정상 종료로 핸들러를 남겼을 가능성에 대비해 먼저 제거한다(캡처/측정은
    // 상호 배타적이라 정상 흐름에서는 no-op).
    ipcMain.removeHandler(CHANNEL_ELEMENT_AT);
    ipcMain.handle(CHANNEL_ELEMENT_AT, (_event, x: number, y: number) => {
      const result = getElementBoundsAtPoint(x + minX, y + minY);
      if (!result) return null;
      return {
        x: result.x - minX,
        y: result.y - minY,
        w: result.w,
        h: result.h,
        name: result.name,
      };
    });

    // renderer 가 ready 를 보내면 background 를 다시 한 번 밀어 준다(초기 유실 대비).
    ipcMain.once(CHANNEL_READY, () => {
      captureBackgroundForRuler(win).catch((err: unknown) => {
        console.warn('[asis] ruler background(ready) 실패:', err);
      });
    });

    // ESC 처리는 renderer 가 담당한다 — measured 상태에서는 "측정 지우기", idle
    // 에서는 cancel IPC 로 창 닫기(2단계). 여기서 globalShortcut ESC 를 별도 등록하지
    // 않는 이유: 그러면 measured 결과가 첫 ESC 에 곧바로 삭제되어 완충 UX 가 깨진다.

    // background 폴링 — Space 전환/화면 변화 시 magnifier 픽셀 갱신.
    const BG_POLL_MS = 2500;
    let bgInFlight = false;
    let bgFailLogged = false;
    const bgPoll = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(bgPoll);
        return;
      }
      if (bgInFlight) return;
      bgInFlight = true;
      captureBackgroundForRuler(win)
        .catch((err: unknown) => {
          if (!bgFailLogged) {
            console.warn('[asis] ruler background polling 실패 (이후 silent):', err);
            bgFailLogged = true;
          }
        })
        .finally(() => { bgInFlight = false; });
    }, BG_POLL_MS);

    const cleanup = (): void => {
      ipcMain.removeHandler(CHANNEL_ELEMENT_AT);
      ipcMain.removeAllListeners(CHANNEL_CANCEL);
      ipcMain.removeAllListeners(CHANNEL_READY);
      clearInterval(bgPoll);
      this.win = null;
    };

    // renderer 의 ESC → cancel IPC 로 창 닫기.
    ipcMain.once(CHANNEL_CANCEL, () => {
      cleanup();
      if (!win.isDestroyed()) win.close();
    });

    win.on('closed', () => {
      // 외부 요인(예: stop())으로 닫혀도 리스너/interval 을 반드시 정리.
      cleanup();
    });
  }

  stop(): void {
    this.stopped = true;
    if (!this.win) return;
    if (!this.win.isDestroyed()) this.win.close();
    this.win = null;
  }
}

type DisplayBounds = { x: number; y: number; width: number; height: number };

/** 측정 오버레이용 BrowserWindow — 캡처 오버레이와 동일 옵션(panel/전역 표시). */
function createRulerWindow(bounds: DisplayBounds): BrowserWindow {
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreenable: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    roundedCorners: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    type: 'panel',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  return win;
}

/**
 * Magnifier 용 background 캡처 — overlay 뜨기 전 화면을 screencapture 로 잡아
 * dataURL 로 renderer 에 전송. selectionOverlay 의 동명 함수와 동일 로직.
 */
async function captureBackgroundForRuler(win: BrowserWindow): Promise<void> {
  const tmpPath = join(tmpdir(), `asis-ruler-bg-${Date.now()}-${process.pid}.png`);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('/usr/sbin/screencapture', ['-x', '-t', 'png', tmpPath]);
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('screencapture timeout (5s)'));
      }, 5000);
      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`screencapture exit ${code}`));
      });
    });
    const buf = await readFile(tmpPath);
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    if (!win.isDestroyed()) {
      win.webContents.send(CHANNEL_BACKGROUND, dataUrl);
    }
  } finally {
    await unlink(tmpPath).catch((err: unknown) => {
      if (!isFileNotFound(err)) console.warn('[asis] ruler background tmp cleanup failed', err);
    });
  }
}

function isFileNotFound(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
