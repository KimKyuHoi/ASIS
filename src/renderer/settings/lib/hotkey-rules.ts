import { HOTKEY_DISABLED } from '../../../shared/editor-hotkeys';
import { codeToKeyName, isEditorToolKeyName } from '../../../shared/key-name';
import { toAccelerator } from './keyboard-utils';

function hasModifier(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

/** 수식키 없는 ESC — 녹화 중이면 녹화 취소, 아니면 창 닫기. (⌘ESC 등은 단축키로 지정 가능) */
export function isPlainEscape(e: KeyboardEvent): boolean {
  return e.key === 'Escape' && !hasModifier(e);
}

/** 수식키 없는 ⌫/Delete — 녹화 중이면 "해제" 명령. */
export function isClearKey(e: KeyboardEvent): boolean {
  return (e.code === 'Backspace' || e.code === 'Delete') && !hasModifier(e);
}

/** 전역 단축키 녹화 중 키 입력 → 새 값. null 이면 무시할 키(수식키만 누름 등). */
export function nextGlobalValue(e: KeyboardEvent): string | null {
  // ⌫ — 이 기능의 단축키를 해제한다. 저장 후 main 은 이 항목을 등록하지 않는다.
  return isClearKey(e) ? HOTKEY_DISABLED : toAccelerator(e);
}

/** 에디터 도구 키 녹화 중 키 입력 → 새 값. null 이면 무시할 키. */
export function nextEditorValue(e: KeyboardEvent): string | null {
  if (isClearKey(e)) return HOTKEY_DISABLED;
  // 수식키 조합은 받지 않는다 — 에디터의 ⌘C/⌘Z 같은 명령과 겹치기 때문.
  // 수식키 자체를 누른 keydown(e.code 'ShiftLeft' 등)도 codeToKeyName 이 null 을 준다.
  if (hasModifier(e)) return null;
  const keyName = codeToKeyName(e.code);
  if (keyName === null || !isEditorToolKeyName(keyName)) return null;
  return keyName;
}

/** 같은 값이 두 곳 이상에 지정된 값 집합. 해제('')는 여러 곳에 있어도 중복이 아니다. */
export function findDuplicates(values: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value === HOTKEY_DISABLED) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
}
