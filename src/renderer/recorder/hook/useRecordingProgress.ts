import { useEffect, useState } from 'react';

/** 경과 초·프레임 수 갱신 주기. */
const PROGRESS_POLL_MS = 250;

/**
 * 녹화 경과 초 + 캡처된 frame 수. active 인 동안만 polling 하고,
 * 다시 active 가 되면 경과 초를 처음부터 센다.
 */
export function useRecordingProgress(active: boolean): { seconds: number; frames: number } {
  const [seconds, setSeconds] = useState(0);
  const [frames, setFrames] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const start = Date.now();
    // 연속 실패 시 250ms 마다 로그가 쌓이지 않도록 이번 녹화의 첫 실패만 남긴다.
    let warned = false;
    const tick = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
      window.recorder.getFrameCount().then(setFrames).catch((err: unknown) => {
        // 프레임 수는 표시용 — 실패해도 다음 tick 에서 다시 읽는다.
        if (warned) return;
        warned = true;
        console.warn('[asis recorder] getFrameCount 실패 (이후 실패는 생략)', err);
      });
    }, PROGRESS_POLL_MS);
    return () => clearInterval(tick);
  }, [active]);

  return { seconds, frames };
}
