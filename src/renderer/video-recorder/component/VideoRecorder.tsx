import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { formatDuration } from '../lib/format-time';

type Phase = 'recording' | 'saving';

/**
 * 화면 영상 녹화 컨트롤 윈도우 — 작은 floating bar.
 *
 * 상태
 *   - recording: REC 점멸 + mm:ss 타이머 + 정지/취소 버튼
 *   - saving: 정지 후 저장 다이얼로그가 뜬 동안. main 이 저장/취소를 끝내면 윈도우를 닫는다.
 *
 * GIF recorder 와 달리 인코딩 단계·프레임 수가 없다 (mov 는 바로 저장).
 */
export default function VideoRecorder(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('recording');
  const [seconds, setSeconds] = useState(0);

  // 경과 초 — recording 단계에서만.
  useEffect(() => {
    if (phase !== 'recording') return undefined;
    const start = Date.now();
    const tick = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => clearInterval(tick);
  }, [phase]);

  // main → renderer: 외부 trigger (글로벌 단축키/트레이).
  useEffect(() => {
    const api = window.videoRecorder;
    if (!api) throw new Error('window.videoRecorder 미노출 — preload 셋업 확인.');
    // IPC 구독 — teardown 에서 모두 해제 (Strict Mode 이중 마운트 시 중복 등록 방지).
    const offTriggerStop = api.onTriggerStop(() => {
      setPhase('saving');
      api.stop();
    });
    const offTriggerCancel = api.onTriggerCancel(() => api.cancel());
    return () => {
      offTriggerStop();
      offTriggerCancel();
    };
  }, []);

  // 키보드: ESC = 취소, Enter = 정지. saving 중에는 무시.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (phase !== 'recording') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        window.videoRecorder.cancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setPhase('saving');
        window.videoRecorder.stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  if (phase === 'saving') {
    return (
      <div className="recorder">
        <span className="recorder__spinner" aria-hidden="true" />
        <div className="recorder__time">저장 준비 중…</div>
      </div>
    );
  }

  return (
    <div className="recorder">
      <div className="recorder__indicator" aria-hidden="true">
        <span className="recorder__dot" />
        REC
      </div>
      <div className="recorder__time">{formatDuration(seconds)}</div>
      <button
        type="button"
        className="recorder__btn recorder__btn--cancel"
        onClick={(): void => window.videoRecorder.cancel()}
        title="취소 (ESC)"
      >
        취소
      </button>
      <button
        type="button"
        className="recorder__btn recorder__btn--stop"
        onClick={(): void => {
          setPhase('saving');
          window.videoRecorder.stop();
        }}
        title="정지 (Enter)"
      >
        정지
      </button>
    </div>
  );
}
