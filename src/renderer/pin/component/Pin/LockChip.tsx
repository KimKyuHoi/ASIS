import type { JSX } from 'react';
import { LockIcon } from './LockIcon';

/**
 * 고정(click-through) 상태 칩 — 좌상단에 항상 보인다.
 * 평소엔 자물쇠 + 짧은 라벨, 핀에 hover 하면 해제 방법 줄이 펼쳐진다 (CSS :hover).
 * 클릭은 어차피 뒤 창으로 가므로 버튼이 아닌 표시 요소다.
 */
export function LockChip({ label, hint }: { label: string; hint: string }): JSX.Element {
  return (
    <div className="pin-chip" role="status">
      <LockIcon />
      <span className="pin-chip__text">
        <span className="pin-chip__label">{label}</span>
        <span className="pin-chip__hint">{hint}</span>
      </span>
    </div>
  );
}
