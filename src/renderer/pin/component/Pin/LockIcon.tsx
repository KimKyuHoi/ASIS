import type { JSX } from 'react';

/** 자물쇠 글리프 — SF Symbols lock.fill 비율을 흉내 낸 12px 아이콘. 색은 currentColor. */
export function LockIcon({ open = false }: { open?: boolean }): JSX.Element {
  return (
    <svg className="pin-lock-icon" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d={open ? 'M3.5 5.5V3.75a2.5 2.5 0 0 1 4.9-.7' : 'M3.5 5.5V3.75a2.5 2.5 0 0 1 5 0V5.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect x="2" y="5.25" width="8" height="5.75" rx="1.4" fill="currentColor" />
    </svg>
  );
}
