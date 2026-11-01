import { systemPreferences } from 'electron';
import log from 'electron-log/main';
import { ClickMonitorManager } from '../step-guide/clickMonitor';
import { InputHighlightOverlay } from '../windows/inputHighlightOverlay';
import { keyLabel, shouldShowKey } from './keyLabel';
import { tInputHighlight } from './inputHighlightCopy';

type Rect = { x: number; y: number; w: number; h: number };

export type InputHighlightOptions = {
  /** 클릭 위치에 파동 링. */
  clicks: boolean;
  /** ⌘·⌃ 조합과 esc·F 키를 배지로. */
  keys: boolean;
};

export type InputHighlightCallbacks = {
  /**
   * 표시를 못 하게 된 이유(권한 없음·헬퍼 없음·헬퍼 종료) — 사전 문구 그대로 알림에 띄운다.
   * 녹화는 계속된다. 녹화 한 번에 최대 한 번만 부른다.
   */
  onWarning: (message: string) => void;
};

/**
 * GIF·화면 녹화의 입력 표시 — 스텝 가이드의 클릭 감지 헬퍼(ClickMonitorManager)를 `keys`
 * 옵션으로 띄워 클릭·키를 받고, InputHighlightOverlay 에 그린다.
 *
 * 왜 Class 인가 (side-effects.md): 헬퍼 프로세스와 오버레이 창을 소유하는 외부 lifecycle 이고
 * React 와 무관하다. index.ts 가 녹화 시작·종료에 맞춰 start/stop 만 부른다.
 *
 * 실패는 녹화를 막지 않는다 — 표시는 보조 기능이라 경고 한 번만 내고 녹화는 그대로 진행한다.
 */
export class InputHighlightManager {
  /**
   * 녹화마다 새로 만든다. ClickMonitorManager.stop() 은 프로세스 close 이벤트에서야 참조를
   * 비우므로, 같은 인스턴스로 곧바로 start() 하면 "이미 실행 중" 으로 throw 한다.
   */
  private monitor: ClickMonitorManager | null = null;
  private readonly overlay = new InputHighlightOverlay();
  /** 이번 녹화에서 이미 경고했는지 — 같은 원인으로 알림을 겹쳐 띄우지 않는다. */
  private warned = false;

  start(rect: Rect, options: InputHighlightOptions, callbacks: InputHighlightCallbacks): void {
    this.stop();
    if (!options.clicks && !options.keys) return;
    this.warned = false;
    const warn = (message: string): void => {
      if (this.warned) return;
      this.warned = true;
      callbacks.onWarning(message);
    };

    this.overlay.show(rect);
    const monitor = new ClickMonitorManager();
    this.monitor = monitor;
    try {
      monitor.start(
        {
          onClick: (point) => {
            if (options.clicks) this.overlay.ripple(point.x, point.y);
          },
          onKey: (key) => {
            if (!options.keys || !shouldShowKey(key)) return;
            const label = keyLabel(key);
            if (label) this.overlay.key(label);
          },
          onNotTrusted: () => {
            // 헬퍼는 살아 있지만 이벤트가 오지 않는다. 시스템 권한 요청 창을 띄워 설정으로 안내한다
            // (prompt=true 는 신뢰되지 않았을 때만 창을 띄운다). 허용해도 이번 녹화엔 반영되지 않는다.
            systemPreferences.isTrustedAccessibilityClient(true);
            warn(tInputHighlight().needsAccessibility);
          },
          onExit: (info) => {
            log.error('[asis] inputHighlight: 감지 헬퍼 비정상 종료', info.stderr || `exit ${String(info.code)}`);
            this.overlay.hide();
            warn(tInputHighlight().helperStopped);
          },
        },
        // 클릭만 켠 경우엔 키보드를 아예 듣지 않는다 — 필요 없는 입력은 받지도 않는다.
        { keys: options.keys },
      );
    } catch (err: unknown) {
      // 바이너리 없음 등 — clickMonitor 가 던지는 문구는 스텝 가이드용이라 이 기능의 문구로 바꾼다.
      log.error('[asis] inputHighlight: 감지 헬퍼 시작 실패', err);
      this.monitor = null;
      this.overlay.hide();
      warn(tInputHighlight().helperMissing);
    }
  }

  /** 여러 번 불러도 안전. */
  stop(): void {
    // 녹화 중이 아니면 monitor 가 없다 — 정상 상태라 ?. 로 건너뛴다.
    this.monitor?.stop();
    this.monitor = null;
    this.overlay.hide();
  }
}

export const inputHighlight = new InputHighlightManager();
