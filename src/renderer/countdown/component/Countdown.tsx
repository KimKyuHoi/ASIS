import { useEffect, useState, type JSX } from 'react';

const initialSeconds = parseInt(
  new URLSearchParams(location.search).get('seconds') ?? '3',
  10,
);

/** 링 원의 반지름 — viewBox 40 안에서 선 두께만큼 안쪽. */
const RING_RADIUS = 18;

/**
 * 지연 캡처 카운트다운 — HUD 원판 위 숫자 + 매초 차오르는 강조색 링.
 * 숫자 자체가 정보라 role="timer" 로 노출한다 (aria-live 기본값 off — 매초 읽지 않는다).
 */
export default function Countdown(): JSX.Element {
  const [count, setCount] = useState(initialSeconds);

  useEffect(() => {
    if (count <= 0) return undefined;
    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count]);

  return (
    <div className="countdown">
      <div className="countdown__badge tabular" role="timer">
        {count > 0 ? (
          <svg key={count} className="countdown__ring" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r={RING_RADIUS} pathLength={100} strokeDasharray={100} />
          </svg>
        ) : null}
        {count > 0 ? count : '✓'}
      </div>
    </div>
  );
}
