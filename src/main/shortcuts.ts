import { globalShortcut } from 'electron';
import { loadHotkeys } from './settings';

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
  /** QR·바코드 스캔 — 영역 선택 → 캡처 → Vision 바코드 인식 → 클립보드. */
  onQr: () => void;
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
    this._register(this.savedHandlers);
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
      [hotkeys.qr, handlers.onQr],
    ];

    for (const [accelerator, callback] of bindings) {
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
