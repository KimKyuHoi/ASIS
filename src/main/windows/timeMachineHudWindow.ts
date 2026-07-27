import { BrowserWindow, ipcMain, screen } from 'electron';
import { loadRendererPage, preloadPath } from './common';

const CHANNEL_READY = 'time-machine-hud:ready';
const CHANNEL_SAVE = 'time-machine-hud:save';
const CHANNEL_STOP = 'time-machine-hud:stop';
const CHANNEL_REVEAL = 'time-machine-hud:reveal';
const CHANNEL_STATE = 'time-machine-hud:state';

/** 알약 크기 — 한 줄에 "● 타임머신 mm:ss 최근 N초 [구간 저장] [정지]" 가 들어가는 폭. */
const HUD_WIDTH = 372;
const HUD_HEIGHT = 38;
/** 화면 가장자리와의 여백. dock 위에 살짝 띄운다. */
const HUD_MARGIN = 16;

/**
 * 알약이 표시할 단계. renderer 의 hook/useTimeMachineHudState.ts 와 동형이다.
 * 경로 같은 내부 정보는 넣지 않는다 — '파일 보기' 는 main 이 보관한 경로로 연다.
 */
export type TimeMachineHudPhase =
  | { kind: 'recording' } |
  { kind: 'saving' } |
  { kind: 'saved'; seconds: number } |
  { kind: 'notice'; message: string };

export type TimeMachineHudState = {
  phase: TimeMachineHudPhase;
  bufferSeconds: number;
  /** 녹화 시작 시각(epoch ms). 경과 시간은 renderer 가 이 값으로 자체 계산한다. */
  startedAt: number;
};

export type TimeMachineHudHandlers = {
  onSave: () => void;
  onStop: () => void;
  onReveal: () => void;
};

/**
 * 타임머신 상태 알약(HUD) 윈도우 lifecycle 관리.
 *
 * recorder/video-recorder 알약과 형태는 닮았지만 성격이 다르다:
 *   - 저 둘은 "한 번의 녹화 세션"을 Promise 로 감싸 settle 하면 닫힌다.
 *   - 이 알약은 타임머신이 켜져 있는 *내내* 떠 있고, 저장은 세션을 끝내지 않는다.
 *     그래서 Promise 가 아니라 start/update/stop 명령형 API 다.
 *
 * 상태의 진실은 main(TimeMachineController) 이 갖는다. 이 클래스는 받은 상태를
 * renderer 로 push 하고, 버튼 클릭을 handlers 로 되돌려주는 통로일 뿐이다.
 *
 * side-effects.md Rule 3 — BrowserWindow lifecycle 은 모듈 스코프 Class.
 */
export class TimeMachineHudWindowManager {
  private win: BrowserWindow | null = null;
  private handlers: TimeMachineHudHandlers | null = null;
  /** renderer 가 ready 를 보내오면 이 값을 그대로 push 한다 (핸드셰이크 race 방지). */
  private state: TimeMachineHudState | null = null;
  private ipcInstalled = false;

  isVisible(): boolean {
    return this.win !== null && !this.win.isDestroyed();
  }

  /** 알약 표시. 이미 떠 있으면 상태만 갱신한다. */
  start(state: TimeMachineHudState, handlers: TimeMachineHudHandlers): void {
    this.handlers = handlers;
    this.state = state;
    if (this.isVisible()) {
      this.pushState();
      return;
    }
    this.installIpc();

    const placement = pickHudPlacement();
    const win = new BrowserWindow({
      width: HUD_WIDTH,
      height: HUD_HEIGHT,
      x: placement.x,
      y: placement.y,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      // showInactive() 로 직접 띄운다 — 생성 시 show 를 켜면 앱이 활성화되면서
      // 전체화면 앱을 쓰던 사용자의 Space 가 전환된다 (프로젝트 기존 이슈).
      show: false,
      webPreferences: {
        preload: preloadPath(),
        sandbox: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // 자기 자신이 녹화본에 찍히지 않도록 캡처 대상에서 제외.
    // 주의: Electron 문서상 macOS 에서 ScreenCaptureKit 기반 캡처는 이 설정을
    // 뚫을 수 있다 — ffmpeg avfoundation 녹화본에 알약이 남는지는 실측 확인 대상.
    win.setContentProtection(true);
    this.win = win;

    win.on('closed', () => {
      // 사용자가 닫을 수단은 없지만(프레임 없음), 앱 종료 등으로 파괴될 수 있다.
      this.win = null;
    });

    loadRendererPage(win, 'time-machine').catch((err: unknown) => {
      console.error('[asis] timeMachineHudWindow load failed', err);
    });

    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      win.showInactive();
    });
  }

  /** 상태 갱신 — 알약이 떠 있지 않으면 아무 것도 하지 않는다. */
  update(state: TimeMachineHudState): void {
    this.state = state;
    if (!this.isVisible()) return;
    this.pushState();
  }

  /** 알약 닫기. 타임머신 정지 시 호출. 이미 닫혀 있으면 no-op. */
  stop(): void {
    this.state = null;
    this.handlers = null;
    if (!this.win) return;
    if (!this.win.isDestroyed()) this.win.close();
    this.win = null;
  }

  private pushState(): void {
    if (!this.win || this.win.isDestroyed() || !this.state) return;
    this.win.webContents.send(CHANNEL_STATE, this.state);
  }

  /**
   * IPC 는 프로세스 전역 1회만 등록하고 handlers 필드를 교체한다.
   * 세션마다 on/removeListener 를 반복하면 창이 닫히는 도중 도착한 메시지가
   * 리스너 없는 채널로 떨어진다 (windows/common.ts 의 provider 패턴과 같은 이유).
   */
  private installIpc(): void {
    if (this.ipcInstalled) return;
    this.ipcInstalled = true;

    ipcMain.on(CHANNEL_READY, () => this.pushState());
    ipcMain.on(CHANNEL_SAVE, () => this.invoke((h) => h.onSave()));
    ipcMain.on(CHANNEL_STOP, () => this.invoke((h) => h.onStop()));
    ipcMain.on(CHANNEL_REVEAL, () => this.invoke((h) => h.onReveal()));
  }

  /**
   * handlers 가 없는 상태(알약이 닫힌 뒤 도착한 잔여 클릭)는 정상 상황이므로
   * 조용히 버린다 — 이 경우만 무시하고, 그 외 실패는 호출된 핸들러가 알린다.
   */
  private invoke(fn: (handlers: TimeMachineHudHandlers) => void): void {
    const handlers = this.handlers;
    if (!handlers) return;
    fn(handlers);
  }
}

/**
 * 알약 위치 — 커서가 있는 디스플레이의 작업영역 우하단.
 *
 * recorderPlacement 를 쓰지 않는 이유: 그 로직은 "캡처 rect 를 피해서" 배치하는데,
 * 타임머신은 디스플레이 전체를 녹화하므로 모든 후보가 rect 와 겹쳐 hidden 이 된다.
 * 상시 표시가 목적인 이 알약은 겹쳐도 보이는 게 맞다.
 */
function pickHudPlacement(): { x: number; y: number } {
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  return {
    x: area.x + area.width - HUD_WIDTH - HUD_MARGIN,
    y: area.y + area.height - HUD_HEIGHT - HUD_MARGIN,
  };
}
