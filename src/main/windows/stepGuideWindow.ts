import { BrowserWindow, ipcMain, screen } from 'electron';
import { is } from '@electron-toolkit/utils';
import { loadRendererPage, preloadPath } from './common';
import { StepGuideManager, type StepGuideState } from '../step-guide/stepGuide';
import { tMain } from '../i18n/strings';

const CHANNEL_STOP = 'step-guide:stop';
const CHANNEL_START_GIF = 'step-guide:start-gif';
const CHANNEL_STOP_GIF = 'step-guide:stop-gif';

/** HUD 로 push 하는 녹화 상태 payload — 스텝 수 + GIF 녹화 중 여부.
 *  renderer 쪽 동일 형태는 preload/index.d.ts 의 StepGuideState / hook 의 StepGuideHudState. */
type StepGuideHudState = {
  stepCount: number;
  gifRecording: boolean;
};

/**
 * 스텝 가이드 녹화 HUD(floating bar) + StepGuideManager lifecycle 관리.
 *
 * video-recorder HUD 와 형태는 같으나(작은 알약·always-on-top·contentProtection),
 * 종료가 Promise settle 이 아니라 StepGuideManager 로 위임된다:
 *   - HUD 는 상태 표시 + 명령(GIF 시작/정지, 종료 형식 md/html 선택)만.
 *   - StepGuideManager 가 전역 클릭 탭·캡처·GIF 인코딩·export 를 소유.
 *
 * side-effects.md Rule 3 — 창 lifecycle + 전역 탭 소유는 Class.
 * null-safety.md — 알림은 콜백으로 위임(main/index 가 Notification 표시).
 */

export type StepGuideNotifiers = {
  info: (message: string) => void;
  error: (message: string) => void;
  /** 손쉬운 사용 권한 안내 — main 이 다이얼로그/설정 열기 처리. */
  needsAccessibility: () => void;
};

export class StepGuideWindowManager {
  private win: BrowserWindow | null = null;
  private guide = new StepGuideManager();

  /**
   * 녹화 시작/종료 시 호출 — 트레이 메뉴바 인디케이터 갱신용.
   * 진짜 옵셔널이다: 미설정이면 통지 없이 동작한다 (timeMachine.onEarlyExit 과 같은 결).
   */
  onActiveChange: (() => void) | null = null;

  /** 녹화 중(HUD 떠있음) 인지 — 트레이/단축키 toggle 판단용. */
  isActive(): boolean {
    return this.guide.isActive();
  }

  /**
   * 녹화 시작 — HUD 를 커서 디스플레이 상단 중앙에 띄우고 클릭 감지 시작.
   * 이미 활성이면 no-op (toggle 은 호출자가 isActive 로 판단).
   */
  show(notifiers: StepGuideNotifiers): void {
    if (this.win) return;

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x: dx, y: dy, width } = display.bounds;
    // 버튼 3개(GIF 시작/MD 저장/HTML 저장) + REC + 카운터 — 300 은 좁아 380 으로 넓힘.
    const winW = 380;
    const winH = 38;

    const win = new BrowserWindow({
      width: winW,
      height: winH,
      x: Math.round(dx + (width - winW) / 2),
      y: Math.round(dy + 24),
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: false,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: preloadPath(),
        sandbox: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // HUD 가 각 스텝 캡처에 잡히지 않도록 — 캡처 대상에서 제외.
    // (전역 monitor 는 "다른 앱" 이벤트만 잡으므로 HUD 클릭은 원래 스텝이 안 되지만,
    //  화면 캡처 픽셀에 HUD 가 찍히는 것을 막기 위해 content protection 도 켠다.)
    win.setContentProtection(true);
    this.win = win;

    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (message.includes('[asis')) {
        if (is.dev) console.info(`[step-guide L${level}]`, message);
      } else if (level === 3 && !message.includes('Autofill')) {
        console.error(`[step-guide error] ${message} (${sourceId}:${line})`);
      }
    });

    loadRendererPage(win, 'step-guide').catch((err: unknown) => {
      console.error('[asis] stepGuideWindow load failed', err);
    });

    // renderer → main: 종료 형식 선택. once 가 아니라 on 을 쓰면 중복 클릭 위험이
    // 있으나, stop() 이 멱등(비활성이면 no-op)이라 안전. 창 close 시 리스너 해제.
    const onStop = (_event: unknown, format: 'markdown' | 'html'): void => {
      this.finishAndExport(format);
    };
    ipcMain.on(CHANNEL_STOP, onStop);

    // renderer → main: [GIF 시작] / [GIF 정지]. StepGuideManager 가 무시/멱등 처리하므로
    // 중복 클릭에도 안전. onStop 과 동일하게 창 close 시 removeListener 로 해제한다.
    const onStartGif = (): void => {
      this.guide.startGif();
    };
    const onStopGif = (): void => {
      this.guide.stopGif();
    };
    ipcMain.on(CHANNEL_START_GIF, onStartGif);
    ipcMain.on(CHANNEL_STOP_GIF, onStopGif);

    win.on('closed', () => {
      ipcMain.removeListener(CHANNEL_STOP, onStop);
      ipcMain.removeListener(CHANNEL_START_GIF, onStartGif);
      ipcMain.removeListener(CHANNEL_STOP_GIF, onStopGif);
      this.win = null;
      // 창이 (사용자 강제 종료 등으로) 닫혔는데 아직 녹화 중이면 export 없이 폐기.
      // 명시적 저장 버튼을 안 눌렀으므로 의도된 폐기 — 다이얼로그 없이 조용히 정지.
      // (finishAndExport 경로에서는 closeWindow() 전에 이미 stop(format) 이 호출돼
      //  guide.isActive() 가 false 이므로 여기서 중복 폐기되지 않는다.)
      this.guide.stopSilently();
    });

    // StepGuideManager 시작 — 반드시 closed 핸들러 등록 *이후*. start() 는 클릭
    // 감지 바이너리(asis-clickmon) 부재 시 동기 throw 하며(clickMonitor.ts — spawn
    // 전이라 내부 상태는 남지 않음), 잡지 않으면 uncaught exception 다이얼로그로
    // 앱이 죽는다. 알림 + HUD 정리로 강등하고, closeWindow() 가 closed 핸들러를
    // 태워 IPC 리스너까지 해제한다.
    try {
      this.startGuide(notifiers);
      this.onActiveChange?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[asis] stepGuide start failed', err);
      notifiers.error(tMain().stepGuide.startFailed(message));
      this.closeWindow();
    }
  }

  /**
   * 외부(트레이/단축키) 정지 트리거 — 기본 HTML 형식으로 종료·export.
   * HUD 가 안 보이거나 focus 를 못 받는 경우의 회수 경로.
   */
  triggerStop(format: 'markdown' | 'html' = 'html'): void {
    this.finishAndExport(format);
  }

  /** 앱 종료 시 정리 — export 없이 감지만 끄고 창을 닫는다. */
  stop(): void {
    // 녹화 중이면 export 시도(사용자 데이터 보존) 없이 조용히 폐기 — 앱 종료 경로라
    // 다이얼로그를 띄우면 종료가 막힌다. 감지만 끄고 창 닫음.
    this.guide.stopSilently();
    this.closeWindow();
  }

  /** StepGuideManager 시작 — 상태 변화를 HUD 로 push, 알림은 notifiers 로. */
  private startGuide(notifiers: StepGuideNotifiers): void {
    this.guide.start({
      onStateChange: (state) => {
        this.pushState(state);
      },
      onNeedsAccessibility: () => {
        notifiers.needsAccessibility();
      },
      onError: (message) => {
        notifiers.error(message);
        // 감지가 죽으면 HUD 도 닫는다 — 유령 HUD 방지.
        this.closeWindow();
      },
      onExported: (result) => {
        if (result.kind === 'saved') {
          // Markdown 은 이미지를 상대경로 별도 파일(step-*.png)로 참조하므로 md 만
          // 옮기면 이미지가 깨진다 — 같은 폴더 유지를 안내한다. HTML 은 단일 파일.
          const isMarkdown = result.path.toLowerCase().endsWith('.md');
          notifiers.info(
            isMarkdown
              ? tMain().stepGuide.savedMarkdown(result.path)
              : tMain().stepGuide.saved(result.path),
          );
        }
        // canceled 는 조용히 — 사용자가 저장 다이얼로그를 취소한 것.
      },
      onExportError: (message) => {
        notifiers.error(tMain().stepGuide.saveFailed(message));
      },
      onEmpty: () => {
        notifiers.info(tMain().stepGuide.empty);
      },
    });
  }

  private finishAndExport(format: 'markdown' | 'html'): void {
    if (!this.guide.isActive()) return;
    // export 는 StepGuideManager 가 비동기 처리(저장 다이얼로그). 창은 즉시 닫는다.
    this.guide.stop(format);
    this.closeWindow();
  }

  private pushState(state: StepGuideState): void {
    if (!this.win || this.win.isDestroyed()) return;
    // idle 은 창이 곧 닫히는 상태 — 0단계·GIF 미녹화로 정규화해 push(HUD 잔상 방지).
    const hud: StepGuideHudState =
      state.kind === 'recording'
        ? { stepCount: state.stepCount, gifRecording: state.gifRecording }
        : { stepCount: 0, gifRecording: false };
    this.win.webContents.send('step-guide:step-count', hud);
  }

  private closeWindow(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close();
    this.win = null;
    this.onActiveChange?.();
  }
}
