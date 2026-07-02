import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { formatDuration } from '../lib/format-time';

type Phase = 'capturing' | 'stitching';

/**
 * 스크롤 캡처 컨트롤 윈도우 — 작은 floating bar(알약).
 *
 * 상태
 *   - capturing: REC 점멸 + mm:ss + 캡처된 프레임 수 + "천천히 스크롤" 안내 +
 *     정지/취소 버튼. 사용자가 대상 영역을 아래로 스크롤하는 동안 main 이 주기적으로
 *     프레임을 찍는다.
 *   - stitching: 정지 후 프레임들을 세로로 이어붙이는 동안(스피너). 끝나면 main 이
 *     저장 다이얼로그를 처리하고 윈도우를 닫는다.
 *
 * GIF recorder 처럼 getFrameCount polling 을 쓰되, 결과물은 GIF 가 아니라
 * 한 장의 긴 PNG 다.
 */
export default function ScrollCapture(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('capturing');
  const [seconds, setSeconds] = useState(0);
  const [frames, setFrames] = useState(0);

  // 경과 초 + 프레임 수 polling — capturing 단계에서만.
  useEffect(() => {
    if (phase !== 'capturing') return undefined;
    const start = Date.now();
    const tick = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
      window.scrollCapture.getFrameCount().then((n) => setFrames(n));
    }, 250);
    return () => clearInterval(tick);
  }, [phase]);

  // main → renderer: 스티칭 시작 알림 + 외부 trigger(글로벌 단축키/트레이).
  useEffect(() => {
    const api = window.scrollCapture;
    if (!api) throw new Error('window.scrollCapture 미노출 — preload 셋업 확인.');
    // IPC 구독 — teardown 에서 모두 해제(Strict Mode 이중 마운트 시 중복 등록 방지).
    const offStitching = api.onStitching(() => setPhase('stitching'));
    const offTriggerStop = api.onTriggerStop(() => {
      setPhase('stitching');
      api.stop();
    });
    const offTriggerCancel = api.onTriggerCancel(() => api.cancel());
    return () => {
      offStitching();
      offTriggerStop();
      offTriggerCancel();
    };
  }, []);

  // 키보드: ESC = 취소, Enter = 정지. stitching 중에는 무시.
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
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  if (phase === 'stitching') {
    return (
      <div className="scroll-capture">
        <span className="scroll-capture__spinner" aria-hidden="true" />
        <div className="scroll-capture__time">
          이어붙이는 중…
          <span className="scroll-capture__sub">{frames}장 합성</span>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-capture">
      <div className="scroll-capture__indicator" aria-hidden="true">
        <span className="scroll-capture__dot" />
        REC
      </div>
      <div className="scroll-capture__time">
        {formatDuration(seconds)}
        <span className="scroll-capture__sub">{frames}장 · 천천히 스크롤</span>
      </div>
      <button
        type="button"
        className="scroll-capture__btn scroll-capture__btn--cancel"
        onClick={(): void => window.scrollCapture.cancel()}
        title="취소 (ESC)"
      >
        취소
      </button>
      <button
        type="button"
        className="scroll-capture__btn scroll-capture__btn--stop"
        onClick={(): void => {
          setPhase('stitching');
          window.scrollCapture.stop();
        }}
        title="정지 (Enter)"
      >
        정지
      </button>
    </div>
  );
}
