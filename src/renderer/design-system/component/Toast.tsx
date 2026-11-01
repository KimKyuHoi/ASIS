import type { JSX, ReactNode } from 'react';
import type { Tone } from '../types/design-system';
import { cx } from '../lib/cx';
import '../asset/toast.css';

type ToastProps = {
  /** 무슨 일이 일어났는지 — 동작 이름과 같은 말로 ("복사" 버튼 → "복사했습니다"). */
  title: string;
  description?: string;
  tone?: Extract<Tone, 'neutral' | 'success' | 'danger'>;
  icon?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
};

/**
 * HUD 알림 — 화면 위에 잠깐 뜨는 어두운 카드. 외형과 무관하게 항상 어둡다.
 * 실패는 role="alert"(즉시 읽음), 그 외는 role="status"(정중하게 읽음).
 * 자동 사라짐 타이머는 부르는 쪽 책임이다 (이 컴포넌트는 표시만).
 */
export function Toast({
  title,
  description,
  tone = 'neutral',
  icon,
  action,
  onDismiss,
  dismissLabel = '닫기',
}: ToastProps): JSX.Element {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('ds-toast', `ds-toast--${tone}`)}>
      {icon === undefined ? null : <span className="ds-toast__icon">{icon}</span>}
      <div className="ds-toast__text">
        <p className="ds-toast__title">{title}</p>
        {description === undefined ? null : <p className="ds-toast__description">{description}</p>}
      </div>
      {action === undefined ? null : <div className="ds-toast__action">{action}</div>}
      {onDismiss === undefined ? null : (
        <button type="button" className="ds-toast__dismiss" aria-label={dismissLabel} onClick={onDismiss}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
