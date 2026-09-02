import { globalShortcut } from 'electron';
import { loadHotkeys } from './settings';
import { HOTKEY_DISABLED } from '../shared/editor-hotkeys';

export type ShortcutHandlers = {
  onRegion: () => void;
  onFullscreen: () => void;
  onWindow: () => void;
  /** 3초 대기 후 전체화면 캡처 — 호버 상태 재현용. */
  onDelayedFullscreen: () => void;
  /** 영역 선택 후 3초 대기 → 캡처 — 호버 상태 재현용. */
  onDelayedRegion: () => void;
  /** 모든 핀의 click-through 해제 — click-through 활성 핀이 키보드/마우스를
   *  못 받으니 외부 글로벌 단축키만이 유일한 회수 경로. */
  onDisableClickThrough: () => void;
  /** GIF 녹화 시작 — 영역 선택 → 일정 간격 캡처 → GIF. */
  onGif: () => void;
  /** 화면 영상 녹화 시작/정지 — 영역 선택 → screencapture -v → .mov. */
  onVideo: () => void;
  /** 영역 선택 → 캡처 → OCR(Vision) → 텍스트 클립보드 복사. */
  onOcr: () => void;
  /** 클립보드 이미지를 바로 Pin window 로 (Snipaste F3 결). */
  onClipboardPin: () => void;
  /** 화면 자 / 간격 측정 오버레이. */
  onRuler: () => void;
  /** 타임머신 상시 녹화 토글(시작/정지). */
  onTimeMachineToggle: () => void;
  /** 타임머신 최근 구간 즉시 저장. */
  onTimeMachineSave: () => void;
  /** 스텝바이스텝 가이드 녹화 토글. */
  onStepGuide: () => void;
  /** 스크롤 캡처 시작/정지. */
  onScrollCapture: () => void;
};

/**
 * 전역 단축키 등록·해제 lifecycle 관리.
 *
 * .claude/rules/side-effects.md 의 Rule 3 — globalShortcut 같은 시스템 전역
 * lifecycle 객체는 Class 로 캡슐화. 명시적 start/stop 으로 등록·해제.
 *
 * reload() — 환경설정에서 단축키 변경 후 재등록. handlers 를 인스턴스에 보관하고
 * stop() → _register() 순으로 교체한다.
 */
export class ShortcutManager {
  private registered: string[] = [];
  private savedHandlers: ShortcutHandlers | null = null;
  /** 환경설정에서 단축키를 녹화하는 동안 true — 이 동안에는 재등록하지 않는다. */
  private paused = false;

  start(handlers: ShortcutHandlers): void {
    if (this.registered.length > 0) {
      throw new Error('ShortcutManager.start() called twice — already running');
    }
    this.savedHandlers = handlers;
    this._register(handlers);
  }

  reload(): void {
    if (!this.savedHandlers) return;
    this.stop();
    // 녹화 중이면 등록을 되살리지 않는다 — resume() 이 책임진다.
    // (녹화 중 저장 → settings:set → reload 경로에서 단축키가 되살아나는 것을 막음)
    if (this.paused) return;
    this._register(this.savedHandlers);
  }

  /**
   * 단축키 녹화 동안 전역 단축키를 일시 해제한다.
   * 해제하지 않으면 ⌘⇧A 를 누르는 순간 영역 캡처가 실행돼 그 조합을 지정할 수 없다.
   * 중복 호출은 무시 — 이미 해제된 상태를 그대로 둔다.
   */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.stop();
  }

  /** 녹화 종료 — 해제했던 전역 단축키를 다시 등록한다. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.reload();
  }

  stop(): void {
    for (const accelerator of this.registered) {
      globalShortcut.unregister(accelerator);
    }
    this.registered = [];
  }

  private _register(handlers: ShortcutHandlers): void {
    // 저장값에 새로 추가된 키가 없을 수 있어 DEFAULT_HOTKEYS 로 병합 (loadHotkeys).
    const hotkeys = loadHotkeys();
    const bindings: Array<[string, () => void]> = [
      [hotkeys.region, handlers.onRegion],
      [hotkeys.fullscreen, handlers.onFullscreen],
      [hotkeys.window, handlers.onWindow],
      [hotkeys.delayedFullscreen, handlers.onDelayedFullscreen],
      [hotkeys.delayedRegion, handlers.onDelayedRegion],
      [hotkeys.disableClickThrough, handlers.onDisableClickThrough],
      [hotkeys.gif, handlers.onGif],
      [hotkeys.video, handlers.onVideo],
      [hotkeys.ocr, handlers.onOcr],
      [hotkeys.clipboardPin, handlers.onClipboardPin],
      [hotkeys.ruler, handlers.onRuler],
      [hotkeys.timeMachineToggle, handlers.onTimeMachineToggle],
      [hotkeys.timeMachineSave, handlers.onTimeMachineSave],
      [hotkeys.stepGuide, handlers.onStepGuide],
      [hotkeys.scrollCapture, handlers.onScrollCapture],
    ];

    for (const [accelerator, callback] of bindings) {
      // 환경설정에서 해제한 단축키('') — 등록하지 않는다. 트레이 메뉴로만 실행 가능.
      if (accelerator === HOTKEY_DISABLED) continue;
      const ok = globalShortcut.register(accelerator, callback);
      if (!ok) {
        // null-safety.md — 등록 실패를 silent 하게 무시하지 않는다.
        this.stop();
        throw new Error(`globalShortcut.register failed for ${accelerator}`);
      }
      this.registered.push(accelerator);
    }
  }
}
