import type { JSX, ReactNode } from 'react';
import type { Tone } from '../types/design-system';
import { cx } from '../lib/cx';
import '../asset/badge.css';

type BadgeProps = {
  tone?: Tone;
  /** 색만으로 상태를 전하지 않도록 글자는 필수. */
  children: ReactNode;
  className?: string;
};

/** 짧은 상태 꼬리표 ("새 기능", "녹화 중", "실패"). 옅은 색조 면 + 본문색 글자. */
export function Badge({ tone = 'neutral', children, className }: BadgeProps): JSX.Element {
  return (
    <span className={cx('ds-badge', `ds-badge--${tone}`, className)}>
      <span className="ds-badge__dot" aria-hidden="true" />
      {children}
    </span>
  );
}
