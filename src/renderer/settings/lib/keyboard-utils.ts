/** keydown 이벤트 → Electron accelerator 문자열 변환 */
export function toAccelerator(e: KeyboardEvent): string | null {
  if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');

  if (parts.length === 0) return null;

  const key = e.key;
  if (/^[a-z]$/i.test(key)) {
    parts.push(key.toUpperCase());
  } else if (/^F\d+$/.test(key)) {
    parts.push(key);
  } else if (/^\d$/.test(key)) {
    parts.push(key);
  } else {
    const special: Record<string, string> = {
      ' ': 'Space',
      'ArrowUp': 'Up',
      'ArrowDown': 'Down',
      'ArrowLeft': 'Left',
      'ArrowRight': 'Right',
      'Enter': 'Return',
      'Escape': 'Escape',
      'Tab': 'Tab',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
    };
    const mapped = special[key];
    if (!mapped) return null;
    parts.push(mapped);
  }

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
