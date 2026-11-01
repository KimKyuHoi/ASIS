import type { JSX, ReactNode } from 'react';
import { cx } from '../lib/cx';
import '../asset/empty-state.css';

type EmptyStateProps = {
  icon?: ReactNode;
  /** 무엇이 비어 있는지 */
  title: string;
  /** 다음에 할 일 — 빈 화면은 행동으로 이끈다 */
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <section className={cx('ds-empty', className)}>
      {icon === undefined ? null : (
        <span className="ds-empty__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h2 className="ds-empty__title">{title}</h2>
      {description === undefined ? null : <p className="ds-empty__description">{description}</p>}
      {action === undefined ? null : <div className="ds-empty__action">{action}</div>}
    </section>
  );
}
