/**
 * 단축키 표기 — Electron accelerator 조각("CommandOrControl", "Shift", "4")을
 * macOS 기호와 읽기용 이름으로 바꾼다. 기호 순서는 macOS 관례(⌃⌥⇧⌘)를 따른다.
 */

type KeyInfo = { symbol: string; spoken: string; order: number };

const MODIFIERS: Record<string, KeyInfo> = {
  control: { symbol: '⌃', spoken: 'Control', order: 0 },
  ctrl: { symbol: '⌃', spoken: 'Control', order: 0 },
  alt: { symbol: '⌥', spoken: 'Option', order: 1 },
  option: { symbol: '⌥', spoken: 'Option', order: 1 },
  shift: { symbol: '⇧', spoken: 'Shift', order: 2 },
  cmd: { symbol: '⌘', spoken: 'Command', order: 3 },
  command: { symbol: '⌘', spoken: 'Command', order: 3 },
  commandorcontrol: { symbol: '⌘', spoken: 'Command', order: 3 },
  cmdorctrl: { symbol: '⌘', spoken: 'Command', order: 3 },
};

const NAMED: Record<string, Pick<KeyInfo, 'symbol' | 'spoken'>> = {
  enter: { symbol: '↩', spoken: 'Return' },
  return: { symbol: '↩', spoken: 'Return' },
  escape: { symbol: 'esc', spoken: 'Escape' },
  esc: { symbol: 'esc', spoken: 'Escape' },
  space: { symbol: 'Space', spoken: 'Space' },
  tab: { symbol: '⇥', spoken: 'Tab' },
  backspace: { symbol: '⌫', spoken: 'Delete' },
  delete: { symbol: '⌦', spoken: 'Forward Delete' },
  up: { symbol: '↑', spoken: 'Up Arrow' },
  down: { symbol: '↓', spoken: 'Down Arrow' },
  left: { symbol: '←', spoken: 'Left Arrow' },
  right: { symbol: '→', spoken: 'Right Arrow' },
};

const LAST = 99;

export function describeKey(raw: string): KeyInfo {
  const key = raw.toLowerCase();
  if (key in MODIFIERS) return MODIFIERS[key];
  if (key in NAMED) return { ...NAMED[key], order: LAST };
  const upper = raw.length === 1 ? raw.toUpperCase() : raw;
  return { symbol: upper, spoken: upper, order: LAST };
}

/** "CommandOrControl+Shift+4" 또는 ['cmd','shift','4'] → 정렬된 KeyInfo 목록 */
export function parseShortcut(shortcut: string | readonly string[]): KeyInfo[] {
  const parts = typeof shortcut === 'string' ? shortcut.split('+') : [...shortcut];
  return parts
    .filter((part) => part !== '')
    .map(describeKey)
    .sort((a, b) => a.order - b.order);
}
