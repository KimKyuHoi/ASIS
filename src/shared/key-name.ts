/**
 * KeyboardEvent.code(물리 키) → 키 이름.
 *
 * 전역 단축키 accelerator 의 마지막 토큰(settings/lib/keyboard-utils.ts)과
 * 에디터 도구 단축키(shared/editor-hotkeys.ts) 양쪽이 같은 이름 집합을 쓴다.
 *
 * e.key 가 아니라 e.code 를 쓰는 이유: 한글 IME 입력 상태에서 e.key 는 'ㅁ'/'Process'
 * 가 되어 어떤 조합도 인식되지 않는다. e.code 는 자판 배열·IME·Caps Lock 과 무관하다.
 *
 * 산출되는 키 이름 집합은 Electron accelerator 가 받는 이름과 일치해야 한다 —
 * 새 키 이름을 추가하면 globalShortcut.register 가 실패해 throw 할 위험이 있다
 * (main/shortcuts.ts:_register).
 */
export function codeToKeyName(code: string): string | null {
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

/**
 * 에디터 도구 단축키로 쓸 수 있는 키 이름인지 — 문자·숫자·F키만.
 * Escape/Delete/Backspace/Space/화살표는 에디터 안에서 이미 다른 뜻(취소·삭제 등)이라 제외.
 */
export function isEditorToolKeyName(keyName: string): boolean {
  return /^([A-Z]|\d|F\d{1,2})$/.test(keyName);
}
