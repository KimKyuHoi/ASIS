import { useEffect, useState } from 'react';

export type Phase = 'capturing' | 'stitching';

export type ScrollProgress = { frames: number; height: number; gaps: number };

export type ScrollCaptureSession = {
  phase: Phase;
  seconds: number;
  /** 채택된 장수 · 지금까지 결과 높이(px) · 이어붙이지 못한 구간 수. */
  progress: ScrollProgress;
  /** 정지 — 합성 단계로 넘어간다. */
  stop: () => void;
  cancel: () => void;
};

/**
 * 스크롤 캡처 알약의 상태와 main 연동.
 *   - capturing 동안 경과 초 + 진행(장수·높이·끊긴 구간) polling (GIF recorder 와 같은 방식).
 *   - main → renderer: 스티칭 시작 알림(최대 높이 도달 포함) + 외부 trigger(단축키/트레이).
 *   - 키보드: ESC = 취소, Enter = 정지. stitching 중에는 무시.
 */
export function useScrollCaptureSession(): ScrollCaptureSession {
  const [phase, setPhase] = useState<Phase>('capturing');
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState<ScrollProgress>({ frames: 0, height: 0, gaps: 0 });

  const stop = (): void => {
    setPhase('stitching');
    window.scrollCapture.stop();
  };
  const cancel = (): void => {
    window.scrollCapture.cancel();
  };

  useEffect(() => {
    if (phase !== 'capturing') return undefined;
    const start = Date.now();
    const tick = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
      window.scrollCapture.getProgress().then(setProgress, (err: unknown) => {
        // 세션 종료 직후 handler 가 지워진 뒤의 잔여 invoke — 표시만 멈추면 된다.
        console.warn('[asis] scroll progress failed', err);
      });
    }, 250);
    return () => {
      clearInterval(tick);
    };
  }, [phase]);

  useEffect(() => {
    const api = window.scrollCapture;
    // IPC 구독 — teardown 에서 모두 해제(Strict Mode 이중 마운트 시 중복 등록 방지).
    const offStitching = api.onStitching(() => {
      setPhase('stitching');
    });
    const offTriggerStop = api.onTriggerStop(() => {
      setPhase('stitching');
      api.stop();
    });
    const offTriggerCancel = api.onTriggerCancel(() => {
      api.cancel();
    });
    return () => {
      offStitching();
      offTriggerStop();
      offTriggerCancel();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (phase !== 'capturing') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        window.scrollCapture.cancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setPhase('stitching');
        window.scrollCapture.stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [phase]);

  return { phase, seconds, progress, stop, cancel };
}
