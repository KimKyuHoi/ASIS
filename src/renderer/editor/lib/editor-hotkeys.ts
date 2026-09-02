import {
  DEFAULT_EDITOR_HOTKEYS,
  EDITOR_TOOLS,
  HOTKEY_DISABLED,
} from '../../../shared/editor-hotkeys';
import type { EditorHotkeyConfig, EditorTool } from '../../../shared/editor-hotkeys';

/**
 * 에디터 창 안의 도구 단축키 표 — 모듈 스코프 외부 store.
 *
 * side-effects.md — main 이 push 하는 설정값이라 React 는 useSyncExternalStore
 * (hook/useEditorHotkeys.ts)로만 읽고, keydown 핸들러는 getEditorHotkeys() 로 직접 읽는다.
 * 초기값은 기본 표 — ipc-init 이 main 의 저장값을 받아 setEditorHotkeys 로 교체한다.
 */
let current: EditorHotkeyConfig = DEFAULT_EDITOR_HOTKEYS;
const listeners = new Set<() => void>();

export function getEditorHotkeys(): EditorHotkeyConfig {
  return current;
}

export function setEditorHotkeys(next: EditorHotkeyConfig): void {
  current = next;
  for (const listener of listeners) listener();
}

/** 변경 구독. 반환값은 cleanup. */
export function subscribeEditorHotkeys(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 키 이름(codeToKeyName 산출값)에 지정된 도구. 해제('')된 도구는 절대 매칭되지 않는다. */
export function toolForKeyName(keyName: string): EditorTool | null {
  if (keyName === HOTKEY_DISABLED) return null;
  for (const tool of EDITOR_TOOLS) {
    if (current[tool] === keyName) return tool;
  }
  return null;
}
