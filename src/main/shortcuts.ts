import { globalShortcut } from 'electron';
import { DEFAULT_HOTKEYS, settingsStore } from './settings';

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
  /** 클립보드 이미지를 바로 Pin window 로 (Snipaste F3 결). */
  onClipboardPin: () => void;
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
    // 기존 저장값에 새로 추가된 키가 없을 수 있으므로 DEFAULT_HOTKEYS 로 fallback 병합.
    const hotkeys = { ...DEFAULT_HOTKEYS, ...settingsStore.get('hotkeys') };
    const bindings: Array<[string, () => void]> = [
      [hotkeys.region, handlers.onRegion],
      [hotkeys.fullscreen, handlers.onFullscreen],
      [hotkeys.window, handlers.onWindow],
      [hotkeys.delayedFullscreen, handlers.onDelayedFullscreen],
      [hotkeys.delayedRegion, handlers.onDelayedRegion],
      [hotkeys.disableClickThrough, handlers.onDisableClickThrough],
      [hotkeys.gif, handlers.onGif],
      [hotkeys.clipboardPin, handlers.onClipboardPin],
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
