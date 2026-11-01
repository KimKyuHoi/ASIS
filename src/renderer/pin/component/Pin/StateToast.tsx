import type { JSX } from 'react';
import { LockIcon } from './LockIcon';

type Props = {
  locked: boolean;
  title: string;
  /** 해제 방법 한 줄. 해제(꺼짐) 토스트에는 없다. */
  hint: string | null;
  onDone: () => void;
};

/**
 * 상태 전환 HUD 토스트 — 핀 가운데에 잠깐 떴다가 CSS 애니메이션으로 사라진다.
 * 타이머 대신 animationend 로 제거 → 언마운트 시 정리할 것이 없다.
 */
export function StateToast({ locked, title, hint, onDone }: Props): JSX.Element {
  return (
    <div className="pin-toast" role="status" onAnimationEnd={onDone}>
      <span className={locked ? 'pin-toast__icon pin-toast__icon--locked' : 'pin-toast__icon'}>
        <LockIcon open={!locked} />
      </span>
      <span className="pin-toast__text">
        <span className="pin-toast__title">{title}</span>
        {hint ? <span className="pin-toast__hint">{hint}</span> : null}
      </span>
    </div>
  );
}
