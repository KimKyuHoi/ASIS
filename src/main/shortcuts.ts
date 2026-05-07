import { globalShortcut } from 'electron';

export type ShortcutHandlers = {
  onRegion: () => void;
  onFullscreen: () => void;
  onWindow: () => void;
  /** 모든 핀의 click-through 해제 — click-through 활성 핀이 키보드/마우스를
   *  못 받으니 외부 글로벌 단축키만이 유일한 회수 경로. */
  onDisableClickThrough: () => void;
  /** 시퀀스 GIF 녹화 시작 — 영역 선택 → 일정 간격 캡처 → GIF. */
  onSequenceGif: () => void;
  /** 클립보드 이미지를 바로 Pin window 로 (Snipaste F3 결). */
  onClipboardPin: () => void;
};

/**
 * 전역 단축키 등록·해제 lifecycle 관리.
 *
 * .claude/rules/side-effects.md 의 Rule 3 — globalShortcut 같은 시스템 전역
 * lifecycle 객체는 Class 로 캡슐화. 명시적 start/stop 으로 등록·해제.
 *
 * 단축키 기본값은 macOS 시스템 단축키 (Cmd+Shift+3/4/5) 와 충돌하지 않도록
 * Cmd+Shift+A/F/W 로 잡는다. 향후 사용자 설정 UI 도입 시 변경 가능.
 */
export class ShortcutManager {
  private registered: string[] = [];

  start(handlers: ShortcutHandlers): void {
    if (this.registered.length > 0) {
      throw new Error('ShortcutManager.start() called twice — already running');
    }

    const bindings: Array<[string, () => void]> = [
      ['CommandOrControl+Shift+A', handlers.onRegion],
      ['CommandOrControl+Shift+F', handlers.onFullscreen],
      ['CommandOrControl+Shift+W', handlers.onWindow],
      ['CommandOrControl+Shift+X', handlers.onDisableClickThrough],
      ['CommandOrControl+Shift+G', handlers.onSequenceGif],
      // F3 충돌 (Mission Control) 회피해 ⌘⇧V — Snipaste 의 F3 와 같은 동작.
      ['CommandOrControl+Shift+V', handlers.onClipboardPin],
    ];

    for (const [accelerator, callback] of bindings) {
      const ok = globalShortcut.register(accelerator, callback);
      if (!ok) {
        // null-safety.md — 등록 실패를 silent 하게 무시하지 않는다.
        // 단축키 충돌·권한 미허용 등 원인이 명시적으로 드러나야 디버그 가능.
        this.stop();
        throw new Error(`globalShortcut.register failed for ${accelerator}`);
      }
      this.registered.push(accelerator);
    }
  }

  stop(): void {
    for (const accelerator of this.registered) {
      globalShortcut.unregister(accelerator);
    }
    this.registered = [];
  }
}
