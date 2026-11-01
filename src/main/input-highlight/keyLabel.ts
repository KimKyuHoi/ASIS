import type { KeyPress } from '../step-guide/clickMonitor';

/**
 * 녹화 키 표시 라벨 — KeyPress → "⌃⌥⇧⌘4" 같은 macOS 메뉴 표기.
 *
 * 라벨은 keyCode(물리 키) 로 정한다. chars 는 현재 입력 소스를 따라 한글 자판에선 'ㅎ' 같은
 * 자모가 오고, Shift 도 반영된다(⌘⇧4 → '$') — 단축키 표기로는 쓸 수 없다.
 * keyCode 값은 Carbon HIToolbox Events.h 의 kVK_* (ANSI 배열 기준).
 */
const KEY_NAMES = new Map<number, string>(Object.entries({
  0x00: 'A', 0x01: 'S', 0x02: 'D', 0x03: 'F', 0x04: 'H', 0x05: 'G', 0x06: 'Z', 0x07: 'X',
  0x08: 'C', 0x09: 'V', 0x0b: 'B', 0x0c: 'Q', 0x0d: 'W', 0x0e: 'E', 0x0f: 'R', 0x10: 'Y',
  0x11: 'T', 0x12: '1', 0x13: '2', 0x14: '3', 0x15: '4', 0x16: '6', 0x17: '5', 0x18: '=',
  0x19: '9', 0x1a: '7', 0x1b: '-', 0x1c: '8', 0x1d: '0', 0x1e: ']', 0x1f: 'O', 0x20: 'U',
  0x21: '[', 0x22: 'I', 0x23: 'P', 0x25: 'L', 0x26: 'J', 0x27: "'", 0x28: 'K', 0x29: ';',
  0x2a: '\\', 0x2b: ',', 0x2c: '/', 0x2d: 'N', 0x2e: 'M', 0x2f: '.', 0x32: '`',
  0x24: '↩', 0x4c: '⌤', 0x30: '⇥', 0x31: 'Space', 0x33: '⌫', 0x75: '⌦', 0x35: 'esc',
  0x7b: '←', 0x7c: '→', 0x7d: '↓', 0x7e: '↑',
  0x73: '↖', 0x77: '↘', 0x74: '⇞', 0x79: '⇟',
  0x7a: 'F1', 0x78: 'F2', 0x63: 'F3', 0x76: 'F4', 0x60: 'F5', 0x61: 'F6', 0x62: 'F7',
  0x64: 'F8', 0x65: 'F9', 0x6d: 'F10', 0x67: 'F11', 0x6f: 'F12',
}).map(([code, name]) => [Number(code), name]));

/**
 * 단독으로 눌러도 표시하는 키 — 입력 글자가 아닌 "동작" 키(esc·F1~F12).
 * asis-clickmon.swift 의 standaloneKeyCodes 와 같은 목록. 헬퍼가 먼저 거르고 여기서 한 번 더 거른다.
 */
const STANDALONE_CODES = new Set([
  0x35, 0x7a, 0x78, 0x63, 0x76, 0x60, 0x61, 0x62, 0x64, 0x65, 0x6d, 0x67, 0x6f,
]);

/**
 * 표시할 키인지 — ⌘·⌃ 가 낀 조합, 또는 esc·F 키만.
 *
 * 수식키 없는 일반 타이핑(⇧ 만 낀 대문자 포함)은 보이지 않는다. ⌥ 만 낀 조합도 뺀다 —
 * 독일어 @(⌥L)·폴란드어 ą(⌥A) 처럼 자판에 따라 ⌥ 는 일반 글자 입력이다. ⌘⌥·⌃⌥ 조합은 표시된다. 녹화에 사용자가 친 글자가
 * 그대로 남으면 메시지·검색어·비밀번호가 영상에 박제된다 — 단축키 시연에 필요한 건 조합뿐이다.
 */
export function shouldShowKey(key: KeyPress): boolean {
  if (key.cmd || key.ctrl) return true;
  return STANDALONE_CODES.has(key.code);
}

/**
 * 라벨 문자열. 수식키 순서는 macOS 메뉴 표기 순서(⌃⌥⇧⌘).
 * 표에 없는 키(ISO·JIS 전용 키, 키패드 등)는 chars 를 대문자로 대신 쓰고, 그것도 비면 null —
 * 무엇인지 모르는 키를 엉뚱한 글자로 보여 주느니 표시하지 않는다.
 */
export function keyLabel(key: KeyPress): string | null {
  // 표에 없는 키는 undefined — 실제로 생기는 경우라(ISO·JIS·키패드) chars 로 대신한다.
  const name = KEY_NAMES.get(key.code) ?? fallbackName(key.chars);
  if (name === null) return null;
  const mods = (key.ctrl ? '⌃' : '') + (key.opt ? '⌥' : '') + (key.shift ? '⇧' : '') + (key.cmd ? '⌘' : '');
  return mods + name;
}

function fallbackName(chars: string): string | null {
  const trimmed = chars.trim();
  // 제어 문자(U+0000~001F, U+007F) 와 Apple 함수 키 사설 영역(U+F700~F8FF) 은 글자로 보여 줄 수 없다.
  if (!trimmed) return null;
  for (const ch of trimmed) {
    const cp = ch.codePointAt(0);
    // 한 글자씩 도는 for-of 라 codePointAt(0) 은 항상 값이 있다 — 없으면 버그.
    if (cp === undefined) throw new Error('keyLabel: 빈 문자 조각');
    if (cp < 0x20 || cp === 0x7f || (cp >= 0xf700 && cp <= 0xf8ff)) return null;
  }
  return trimmed.toUpperCase();
}
