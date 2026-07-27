import { useEffect, useState } from 'react';

/** 화면 갱신 주기(ms). 초 단위 표시라 250ms 면 초 경계를 눈에 띄는 지연 없이 넘긴다. */
const TICK_MS = 250;

/**
 * `startedAt`(epoch ms) 부터 지금까지의 경과 초.
 *
 * @param startedAt 기준 시각. null 이면 아직 시작 정보를 못 받은 상태 — 0 을 반환하고
 *                  타이머도 돌리지 않는다.
 * @param active    false 면 타이머를 멈춘다 (저장 중·저장됨 단계에서 불필요한 리렌더 방지).
 */
export function useElapsedSeconds(startedAt: number | null, active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (startedAt === null || !active) return undefined;
    // effect 본문에서 동기 setState 를 하지 않는다 (react-hooks/set-state-in-effect).
    // 첫 값은 최대 TICK_MS 뒤에 채워지지만, 알약이 뜨는 순간의 경과는 어차피 0초라
    // 사용자에게 보이는 차이가 없다.
    const tick = setInterval(() => {
      setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, TICK_MS);
    return () => clearInterval(tick);
  }, [startedAt, active]);

  return seconds;
}
