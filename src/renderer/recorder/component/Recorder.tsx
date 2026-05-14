import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { formatTime } from '../lib/format-time';

type Phase = 'recording' | 'encoding';

/**
 * 녹화 컨트롤 윈도우 — 작은 floating bar.
 *
 * 상태
 *   - recording: REC 점멸 + mm:ss 타이머 + frame 수 + 정지/취소 버튼
 *   - encoding: 스피너 + "GIF 만드는 중…" — 사용자가 정지 누른 후, ffmpeg
 *               2-pass 인코딩이 끝날 때까지 (수 초). 끝나면 main 이 윈도우 close.
 */
export default function Recorder(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('recording');
  const [seconds, setSeconds] = useState(0);
  const [frames, setFrames] = useState(0);

  // 경과 초 + frame polling — recording 단계에서만.
  useEffect(() => {
    if (phase !== 'recording') return undefined;
    const start = Date.now();
    const tick = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
      window.recorder.getFrameCount().then((n) => setFrames(n));
    }, 250);
    return () => clearInterval(tick);
  }, [phase]);

  // main → renderer: 인코딩 시작 알림 + 외부 trigger (글로벌 단축키 등).
  useEffect(() => {
    const api = window.recorder;
    if (!api) throw new Error('window.recorder 미노출 — preload 셋업 확인.');
    api.onEncoding(() => setPhase('encoding'));
    api.onTriggerStop(() => api.stop());
    api.onTriggerCancel(() => api.cancel());
  }, []);

  // 키보드: ESC = 취소(recording), Enter = 정지(recording). encoding 중에는 무시.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (phase !== 'recording') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        window.recorder.cancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        window.recorder.stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  if (phase === 'encoding') {
    return (
      <div className="recorder">
        <span className="recorder__spinner" aria-hidden="true" />
        <div className="recorder__time">
          GIF 만드는 중…
          <span className="recorder__sub">{frames}프레임 인코딩</span>
        </div>
      </div>
    );
  }

  return (
    <div className="recorder">
      <div className="recorder__indicator" aria-hidden="true">
        <span className="recorder__dot" />
        REC
      </div>
      <div className="recorder__time">
        {formatTime(seconds)}
        <span className="recorder__sub">{frames}프레임</span>
      </div>
      <button
        type="button"
        className="recorder__btn recorder__btn--cancel"
        onClick={(): void => window.recorder.cancel()}
        title="취소 (ESC)"
      >
        취소
      </button>
      <button
        type="button"
        className="recorder__btn recorder__btn--stop"
        onClick={(): void => window.recorder.stop()}
        title="정지 (Enter)"
      >
        정지
      </button>
    </div>
  );
}

