import type { JSX } from 'react';
import { parseShortcut } from '../lib/keys';
import { cx } from '../lib/cx';
import '../asset/key-cap.css';

type KeyCapProps = {
  /** "CommandOrControl+Shift+4" (Electron accelerator) 또는 ['cmd', 'shift', '4'] */
  shortcut: string | readonly string[];
  className?: string;
};

/** 단축키 표시. 화면에는 ⌘⇧4, 스크린리더에는 "Command Shift 4". */
export function KeyCap({ shortcut, className }: KeyCapProps): JSX.Element {
  const keys = parseShortcut(shortcut);
  return (
    <kbd className={cx('ds-keycap', className)} aria-label={keys.map((key) => key.spoken).join(' ')}>
      {keys.map((key) => (
        <kbd key={key.spoken} className="ds-keycap__key" aria-hidden="true">
          {key.symbol}
        </kbd>
      ))}
    </kbd>
  );
}
