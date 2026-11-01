import { BrowserWindow, ipcMain, screen } from 'electron';
import { is } from '@electron-toolkit/utils';
import { configureFloatingWindow, loadRendererPage, preloadPath } from './common';
import { claimEsc, type EscClaim } from './escClaim';
import { GuideEditorWindows } from './stepGuideEditorWindow';
import { StepGuideManager, type StepGuideState } from '../step-guide/stepGuide';
import { tGuide } from '../step-guide/guideCopy';
import { tMain } from '../i18n/strings';
import { UserFacingError, userMessageOf } from '../userFacingError';

const CHANNEL_STOP = 'step-guide:stop';
const CHANNEL_START_GIF = 'step-guide:start-gif';
const CHANNEL_STOP_GIF = 'step-guide:stop-gif';
const CHANNEL_CANCEL = 'step-guide:cancel';

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
 *   - HUD 는 상태 표시 + 명령(GIF 시작/정지, [완료])만.
 *   - StepGuideManager 가 전역 클릭 탭·캡처·GIF 인코딩을 소유.
 *   - [완료] 후 결과는 GuideEditorWindows(stepGuideEditorWindow.ts)가 앱 편집 창으로 띄운다.
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
  /** 녹화 중 전역 ESC = [취소]. 알약이 포커스를 못 받아도(showInactive) 취소할 수 있게. */
  private esc: EscClaim | null = null;
  private readonly guide = new StepGuideManager();
  private readonly editors = new GuideEditorWindows();

  /**
   * 녹화 시작/종료 시 호출 — 트레이 메뉴바 인디케이터 갱신용.
   * 진짜 옵셔널이다: 미설정이면 통지 없이 동작한다.
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
    // 녹화 알약(배지·mm:ss·단계 수 + GIF/취소/정지 버튼 3개). 알약은 창 가운데 놓이고,
    // 위아래 여백은 알약 그림자가 잘리지 않게 둔 몫. 영어 문구까지 들어가는 폭.
    const winW = 460;
    const winH = 44;

    const win = new BrowserWindow({
      width: winW,
      height: winH,
      x: Math.round(dx + (width - winW) / 2),
      y: Math.round(dy + 24),
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      // 기본 show 는 앱 활성화 → 전체화면 Space 전환을 부를 수 있다. 숨겨 만든 뒤
      // 로드가 끝나면 showInactive 로 띄운다(recorderWindow 와 같은 규칙).
      show: false,
      // 비활성 창이라 첫 클릭이 활성화로만 소비되지 않게 — [완료]가 한 번에 눌려야 한다.
      acceptFirstMouse: true,
      hasShadow: false,
      resizable: false,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: preloadPath(),
        sandbox: false,
      },
    });
    // 항상 위 + 모든 Space + Mission Control 에서 숨김 — 화면 위 보조 창 공통 설정.
    configureFloatingWindow(win);
    // HUD 가 각 스텝 캡처에 잡히지 않도록 — 캡처 대상에서 제외.
    // (전역 monitor 는 "다른 앱" 이벤트만 잡으므로 HUD 클릭은 원래 스텝이 안 되지만,
    //  화면 캡처 픽셀에 HUD 가 찍히는 것을 막기 위해 content protection 도 켠다.)
    win.setContentProtection(true);
    this.win = win;
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) win.showInactive();
    });

    win.webContents.on('console-message', (details) => {
      const { level, message, lineNumber, sourceId } = details;
      if (message.includes('[asis')) {
        if (is.dev) console.info(`[step-guide ${level}]`, message);
      } else if (level === 'error' && !message.includes('Autofill')) {
        console.error(`[step-guide error] ${message} (${sourceId}:${lineNumber})`);
      }
    });

    loadRendererPage(win, 'step-guide').catch((err: unknown) => {
      console.error('[asis] stepGuideWindow load failed', err);
    });

    const unbindIpc = this.bindHudIpc();

    win.on('closed', () => {
      unbindIpc();
      // ESC 는 녹화 동안만 쥔다 — 저장 다이얼로그·편집 창이 ESC 를 받을 수 있게 창과 함께 놓는다.
      this.esc?.release();
      this.esc = null;
      this.win = null;
      // 창이 (사용자 강제 종료 등으로) 닫혔는데 아직 녹화 중이면 export 없이 폐기.
      // 명시적 저장 버튼을 안 눌렀으므로 의도된 폐기 — 다이얼로그 없이 조용히 정지.
      // [완료](finishAndEdit) 경로는 stop() 이 진행 중 캡처·GIF 인코딩을 기다리는 중이다 —
      // 여기서 폐기하면 그 결과(가이드 전체)가 사라지므로 건너뛴다. 헬퍼 사망·강제 닫힘은 정리.
      if (!this.guide.isFinishing()) this.guide.stopSilently();
    });

    // StepGuideManager 시작 — 반드시 closed 핸들러 등록 *이후*. start() 는 클릭
    // 감지 바이너리(asis-clickmon) 부재 시 동기 throw 하며(clickMonitor.ts — spawn
    // 전이라 내부 상태는 남지 않음), 잡지 않으면 uncaught exception 다이얼로그로
    // 앱이 죽는다. 알림 + HUD 정리로 강등하고, closeWindow() 가 closed 핸들러를
    // 태워 IPC 리스너까지 해제한다.
    try {
      this.startGuide(notifiers);
      // 다른 기능(영역 선택 등)이 ESC 를 쥐고 있으면 점유에 실패한다 — 그때는 버튼으로만 취소.
      this.esc = claimEsc(() => {
        this.cancelRecording();
      });
      this.onActiveChange?.();
    } catch (err) {
      // 원문(경로·빌드 안내 등)은 로그로만. 알림은 사전 문구(userMessageOf).
      console.error('[asis] stepGuide start failed', err, err instanceof UserFacingError ? err.detail : '');
      notifiers.error(tMain().stepGuide.startFailed(userMessageOf(err)));
      this.closeWindow();
    }
  }

  /** 좌표가 녹화 알약이나 스텝 가이드 편집 창 위인지 — 그 클릭은 단계로 기록하지 않는다. */
  private isOwnWindowAt(point: { x: number; y: number }): boolean {
    const hud = this.win && !this.win.isDestroyed() ? [this.win] : [];
    return [...hud, ...this.editors.windows()].some((w) => {
      if (!w.isVisible()) return false;
      const b = w.getBounds();
      const inX = point.x >= b.x && point.x < b.x + b.width;
      return inX && point.y >= b.y && point.y < b.y + b.height;
    });
  }

  /**
   * HUD 버튼 IPC 연결 — 반환값을 부르면 해제한다(창 closed 에서).
   * StepGuideManager·cancelRecording 이 중복 호출을 무시/멱등 처리하므로 연타에도 안전.
   */
  private bindHudIpc(): () => void {
    // [정지]. preload 의 stop(format) 은 예전 MD/HTML 선택의 흔적이라 인자를 무시한다.
    const onStop = (): void => {
      this.finishAndEdit();
    };
    const onStartGif = (): void => {
      this.guide.startGif();
    };
    const onStopGif = (): void => {
      this.guide.stopGif();
    };
    // [취소] — 기록한 단계·임시 파일을 버리고 편집 창을 열지 않는다.
    const onCancel = (): void => {
      this.cancelRecording();
    };
    ipcMain.on(CHANNEL_STOP, onStop);
    ipcMain.on(CHANNEL_START_GIF, onStartGif);
    ipcMain.on(CHANNEL_STOP_GIF, onStopGif);
    ipcMain.on(CHANNEL_CANCEL, onCancel);
    return () => {
      ipcMain.removeListener(CHANNEL_STOP, onStop);
      ipcMain.removeListener(CHANNEL_START_GIF, onStartGif);
      ipcMain.removeListener(CHANNEL_STOP_GIF, onStopGif);
      ipcMain.removeListener(CHANNEL_CANCEL, onCancel);
    };
  }

  /**
   * [취소]·ESC — 녹화를 버린다. 기록한 단계·tmp GIF 를 지우고 편집 창은 열지 않는다.
   * 이미 [정지]로 마무리 중이면(편집 창을 띄우려 기다리는 중) 그 흐름을 존중해 아무것도 안 한다.
   */
  private cancelRecording(): void {
    if (this.guide.isFinishing()) return;
    this.guide.stopSilently();
    this.closeWindow();
  }

  /**
   * 외부(트레이/단축키) 정지 트리거 — HUD [완료]와 같다.
   * 인자는 index.ts 호출부 호환용(예전 MD/HTML 선택) — 무시한다.
   */
  triggerStop(_format?: 'markdown' | 'html'): void {
    this.finishAndEdit();
  }

  /** 저장 전일 수 있는 편집 창이 떠 있는지 — 앱 종료 전 확인(before-quit)용. */
  hasOpenEditors(): boolean {
    return this.editors.hasOpen();
  }

  /**
   * 앱 종료 전 편집 창 정리 — 미저장 창은 "저장하지 않고 닫기" 확인을 띄운다.
   * 모두 닫히면 true. 사용자가 하나라도 취소하면 false → 호출자는 종료를 멈춘다.
   */
  closeEditorsForQuit(): Promise<boolean> {
    return this.editors.closeAllForQuit();
  }

  /** 앱 종료 시 정리 — 녹화는 폐기, 편집 창은 닫는다. */
  stop(): void {
    // 앱 종료 경로라 다이얼로그를 띄우면 종료가 막힌다. 감지만 끄고 창 닫음.
    // 마무리 중(finishing)이던 녹화도 여기선 버린다 — 종료 중에 편집 창을 새로 띄우지 않게.
    // 편집 창은 확인 없이 닫힌다. 미저장 확인은 before-quit 의 closeEditorsForQuit 가 먼저 한다.
    this.guide.stopSilently();
    this.closeWindow();
    this.editors.closeAll();
  }

  /** StepGuideManager 시작 — 상태 변화를 HUD 로 push, 알림은 notifiers 로. */
  private startGuide(notifiers: StepGuideNotifiers): void {
    this.guide.start({
      onStateChange: (state) => {
        this.pushState(state);
        // idle 은 녹화 종료·마무리 완료 시점 — 트레이 인디케이터를 다시 그린다
        // (stop 직후엔 마무리 중이라 isActive 가 아직 true 일 수 있어, 끝날 때 한 번 더 필요).
        if (state.kind === 'idle') this.onActiveChange?.();
      },
      onNeedsAccessibility: () => {
        notifiers.needsAccessibility();
      },
      onError: (message) => {
        notifiers.error(message);
        // 감지가 죽으면 HUD 도 닫는다 — 유령 HUD 방지.
        this.closeWindow();
      },
      onReady: (guide) => {
        this.editors.open(guide, {
          onSaved: (path) => {
            notifiers.info(tMain().stepGuide.saved(path));
          },
          onError: (message) => {
            notifiers.error(message);
          },
        }).catch((err: unknown) => {
          console.error('[asis] stepGuide: 편집 창 열기 실패', err);
          notifiers.error(tGuide().editorOpenFailed(userMessageOf(err)));
        });
      },
      onEmpty: () => {
        notifiers.info(tMain().stepGuide.empty);
      },
      isOwnWindowAt: (point) => this.isOwnWindowAt(point),
    });
  }

  private finishAndEdit(): void {
    if (!this.guide.isActive()) return;
    // stop() 이 onReady 로 편집 창을 띄운다. HUD 는 즉시 닫는다.
    this.guide.stop();
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
