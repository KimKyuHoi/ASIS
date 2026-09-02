import { codeToKeyName } from '../../../shared/key-name';

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
