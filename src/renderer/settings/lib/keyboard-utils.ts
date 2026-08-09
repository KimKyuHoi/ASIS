/**
 * KeyboardEvent.code(물리 키) → accelerator 의 키 이름.
 *
 * e.key 가 아니라 e.code 를 쓰는 이유: 한글 IME 입력 상태에서 e.key 는 'ㅁ'/'Process'
 * 가 되어 어떤 조합도 인식되지 않는다. e.code 는 자판 배열·IME·Caps Lock 과 무관하다
 * (에디터 단축키도 같은 이유로 code 를 쓴다 — editor/hook/useEditorKeyboard.ts:59).
 *
 * 산출되는 키 이름 집합은 이전 e.key 기반 구현과 동일하게 유지한다 —
 * 새 키 이름을 추가하면 globalShortcut.register 가 실패해 throw 할 위험이 있다
 * (main/shortcuts.ts:_register).
 */
function codeToKeyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];

  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];

  if (/^F\d{1,2}$/.test(code)) return code;

  const special: Record<string, string> = {
    Space: 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    NumpadEnter: 'Return',
    Escape: 'Escape',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
  };
  // 지원 목록에 없는 물리 키(구두점·Numpad 등)는 null — 호출부가 입력을 무시한다.
  return special[code] ?? null;
}

/** keydown 이벤트 → Electron accelerator 문자열 변환 */
export function toAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');

  // 수식키만으로는 단축키가 될 수 없다 — 수식키 자체를 누른 keydown 도 여기서 걸러진다.
  if (parts.length === 0) return null;

  const keyName = codeToKeyName(e.code);
  if (!keyName) return null;
  parts.push(keyName);

  return parts.join('+');
}

/** Electron accelerator → 사람이 읽기 쉬운 macOS 형식 */
export function toDisplayString(accelerator: string): string {
  return accelerator
    .replace('CommandOrControl', '⌘')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .split('+')
    .join('');
}
