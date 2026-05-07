import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SelectionResult =
  | { kind: 'selected'; rect: Rect } |
  { kind: 'canceled' };

const CHANNEL_REGION = 'capture:region';
const CHANNEL_CANCEL = 'capture:cancel';
const CHANNEL_BACKGROUND = 'capture:background';

/**
 * 영역 선택 오버레이 — 풀스크린 transparent BrowserWindow lifecycle 관리.
 *
 * .claude/rules/side-effects.md 의 Class 판별 질문에 부합:
 *   "이 객체를 React 없이 단위 테스트로 의미 있게 검증할 수 있는가?" → Yes.
 *   BrowserWindow 라는 외부 리소스 + IPC 채널은 React 데이터 흐름 무관.
 *
 * lifecycle 패턴은 Tray·GlobalShortcut 의 영속 start/stop 과 다르다 —
 * ephemeral 이라 show() 가 promise 를 반환하고 결과 도출 후 자동 닫힌다.
 *
 * v1 한계 — primary display 만 다룬다 (다중 모니터는 v2).
 */
export class SelectionOverlayManager {
  private win: BrowserWindow | null = null;

  show(): Promise<SelectionResult> {
    if (this.win) {
      // 이미 떠 있으면 focus 후 silent canceled 반환 — 중복 캡처 방지.
      // null-safety: 의도된 옵셔널 흐름 (사용자가 단축키 두 번 누른 경우).
      this.win.focus();
      return Promise.resolve({ kind: 'canceled' });
    }

    const display = screen.getPrimaryDisplay();
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
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
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    });
    this.win = win;

    // 메뉴바 위까지 떠야 하므로 가장 높은 layer.
    win.setAlwaysOnTop(true, 'screen-saver');
    // 다른 앱이 fullscreen 이어도 그 위에 표시.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // macOS 26β 에서 transparent+alwaysOnTop 윈도우가 자동 focus 못 받는 회귀.
    // ready-to-show 시점에 명시 focus 호출 — ESC 단축키가 keydown 으로 들어옴.
    win.once('ready-to-show', () => {
      win.focus();
      win.webContents.focus();
    });

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(
        `[asis] selectionOverlay did-fail-load code=${code} desc=${desc} url=${url}`,
      );
    });

    // dev / prod 모두 빌드된 selection 페이지를 file:// 로 로드.
    //
    // electron-vite multi-entry 의 dev URL 매핑이 vite docs 에서 명확하지 않아
    // (시도한 두 형식 모두 root 환영 페이지로 fallback) loadFile 로 통일.
    // 비용: selection 페이지 수정 시 별도 빌드 필요 (HMR 잃음). 영역 선택
    // 컴포넌트가 자주 변하지 않을 거라 감수 가능 — Phase 3 에디터에서 HMR 가
    // 진짜 필요해지면 그때 dev URL 매핑 정답을 다시 찾는다.
    const overlayPath = join(__dirname, '../renderer/selection/index.html');
    console.info(`[asis] selectionOverlay loadFile: ${overlayPath}`);
    win.loadFile(overlayPath).catch((err: unknown) => {
      console.error('[asis] selectionOverlay loadFile failed', err);
    });

    // Color picker / Magnifier 용 background 캡처 — overlay 띄우기 전 시점의 화면.
    // overlay 가 mount 되면 IPC 로 dataURL 전송 → renderer 가 픽셀 read.
    captureBackgroundForOverlay(win).catch((err: unknown) => {
      console.warn('[asis] background 캡처 실패 (color picker 비활성):', err);
    });

    // macOS 26β 에서 transparent+alwaysOnTop 윈도우가 keydown 을 못 받는 회귀 우회.
    // selection 활성 시점에만 ESC 를 globalShortcut 으로 잡고, settle 시 unregister.
    // 부작용: selection 떠있는 동안 다른 앱의 ESC 도 우리한테 옴 — 의도된 trade-off
    // (사용자가 캡처하려 한 컨텍스트라 OK).
    const ESC_ACCEL = 'Escape';
    return new Promise<SelectionResult>((resolve) => {
      let settled = false;
      const settle = (result: SelectionResult): void => {
        if (settled) return;
        settled = true;
        // 핸들러·리스너 cleanup — leak 방지.
        ipcMain.removeHandler(CHANNEL_REGION);
        ipcMain.removeAllListeners(CHANNEL_CANCEL);
        globalShortcut.unregister(ESC_ACCEL);
        if (!win.isDestroyed()) {
          win.close();
        }
        resolve(result);
      };

      // ESC 글로벌 fallback — renderer keydown 이 안 잡힐 때를 대비.
      const escOk = globalShortcut.register(ESC_ACCEL, () => {
        settle({ kind: 'canceled' });
      });
      if (!escOk) {
        console.warn(
          '[asis] selectionOverlay: ESC globalShortcut 등록 실패 — renderer keydown 만 의지',
        );
      }

      ipcMain.handleOnce(CHANNEL_REGION, (_event, rect: Rect) => {
        settle({ kind: 'selected', rect });
      });

      ipcMain.once(CHANNEL_CANCEL, () => {
        settle({ kind: 'canceled' });
      });

      // 윈도우가 외부 요인 (Cmd+W, dock kill 등) 으로 닫히면 fallback canceled.
      win.on('closed', () => {
        this.win = null;
        settle({ kind: 'canceled' });
      });
    });
  }

  stop(): void {
    if (!this.win) return;
    if (!this.win.isDestroyed()) {
      this.win.close();
    }
    this.win = null;
  }
}

/**
 * Color picker / Magnifier 용 background 캡처.
 *
 * overlay 가 *띄워지기 전* 시점의 화면을 screencapture 로 잡고, dataURL 로
 * renderer 에 전송. overlay 가 mount 후 그걸 받아 픽셀 read 에 사용.
 *
 * 한계: overlay 가 떠있는 동안 화면 변화는 반영 안 됨 (정적 background).
 * 일반 캡처 도구의 동작과 일치 — color picker 는 *영역 선택 시점의 화면* 의미.
 */
async function captureBackgroundForOverlay(
  win: BrowserWindow,
): Promise<void> {
  const tmpPath = join(
    tmpdir(),
    `asis-bg-${Date.now()}-${process.pid}.png`,
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn('/usr/sbin/screencapture', [
      '-x',
      '-t',
      'png',
      tmpPath,
    ]);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`screencapture exit ${code}`));
    });
  });
  const buf = await readFile(tmpPath);
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  if (!win.isDestroyed()) {
    win.webContents.send(CHANNEL_BACKGROUND, dataUrl);
  }
  await unlink(tmpPath).catch(() => {});
}
