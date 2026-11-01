import type { FocusEvent, JSX, KeyboardEvent, ReactNode } from 'react';
import { cx } from '../lib/cx';
import '../asset/toolbar.css';

const ITEM_SELECTOR = 'button:not(:disabled), [role="radio"]:not(:disabled), select:not(:disabled)';

const itemsOf = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(ITEM_SELECTOR));

/** 툴바는 Tab 정지점이 하나(WAI-ARIA toolbar 패턴). 포커스된 항목만 tabIndex 0. */
const syncTabStops = (root: HTMLElement, active: Element | null): void => {
  const items = itemsOf(root);
  const current = items.find((item) => item === active) ?? items.at(0);
  for (const item of items) item.tabIndex = item === current ? 0 : -1;
};

const NEXT_INDEX: Record<string, (index: number, length: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_i, n) => n - 1,
};

type ToolbarProps = {
  /** 툴바 이름 (예: "주석 도구") */
  label: string;
  children: ReactNode;
  className?: string;
};

/** 아이콘 버튼 묶음. ←/→/Home/End 로 이동한다. */
export function Toolbar({ label, children, className }: ToolbarProps): JSX.Element {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next = NEXT_INDEX[event.key] as ((i: number, n: number) => number) | undefined;
    if (next === undefined) return;
    const items = itemsOf(event.currentTarget);
    const index = items.findIndex((item) => item === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    items[next(index, items.length)].focus();
  };
  const handleFocus = (event: FocusEvent<HTMLDivElement>): void => {
    syncTabStops(event.currentTarget, event.target);
  };
  const attach = (node: HTMLDivElement | null): void => {
    if (node) syncTabStops(node, null);
  };
  return (
    <div
      ref={attach}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      className={cx('ds-toolbar', className)}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
    >
      {children}
    </div>
  );
}

/** 툴바 안 구분선. */
export function ToolbarSeparator(): JSX.Element {
  return <span role="separator" aria-orientation="vertical" className="ds-toolbar__separator" />;
}
