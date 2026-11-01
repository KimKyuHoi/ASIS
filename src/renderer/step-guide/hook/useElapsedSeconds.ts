import { useEffect, useState } from 'react';

/**
 * 녹화 경과 초 — 알약이 뜬 순간(= 녹화 시작)부터 센다.
 * side-effects.md — 타이머를 React state 와 동기화하는 자리라 useEffect. 창이 닫히면 해제.
 */
export function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      // 누적 +1 이 아니라 시작 시각 기준 — 창이 잠깐 멈춰도(백그라운드 스로틀) 시간이 밀리지 않는다.
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => {
      window.clearInterval(tick);
    };
  }, []);
  return seconds;
}
