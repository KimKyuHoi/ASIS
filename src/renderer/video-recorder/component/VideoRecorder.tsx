import { useEffect, useEffectEvent, useState, type JSX } from 'react';
import { useLanguage } from '../../../shared/i18n/use-language';
import { RecordingHud } from '../../design-system/component';
import { videoRecorderStrings } from '../lib/strings';

type Phase = 'recording' | 'saving';

/**
 * 화면 영상 녹화 컨트롤 윈도우 — 작은 floating bar.
 *
 * 상태
 *   - recording: REC 점멸 + mm:ss 타이머 + 정지/취소 버튼
 *   - saving: 정지 후 저장 다이얼로그가 뜬 동안. main 이 저장/취소를 끝내면 윈도우를 닫는다.
 *
 * GIF recorder 와 달리 인코딩 단계·프레임 수가 없다 (mov 는 바로 저장).
 * 모양은 GIF 녹화와 같은 design-system RecordingHud.
 */
export default function VideoRecorder(): JSX.Element {
  const t = videoRecorderStrings[useLanguage()];
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

  // 정지 — 버튼·Enter·외부 trigger 공통. 저장 다이얼로그 동안 saving 표시로 바꾼다.
  const requestStop = (): void => {
    setPhase('saving');
    window.videoRecorder.stop();
  };

  // 키보드: ESC = 취소, Enter = 정지. saving 중에는 무시.
  // Effect Event — 최신 phase 를 읽되 리스너는 마운트 동안 한 번만 등록한다.
  const onKeyDown = useEffectEvent((e: KeyboardEvent): void => {
    if (phase !== 'recording') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      window.videoRecorder.cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      requestStop();
    }
  });
  const onTriggerStop = useEffectEvent(requestStop);

  // main → renderer: 외부 trigger (글로벌 단축키/트레이) + 키보드.
  useEffect(() => {
    const api = window.videoRecorder;
    // IPC 구독 — teardown 에서 모두 해제 (Strict Mode 이중 마운트 시 중복 등록 방지).
    const offTriggerStop = api.onTriggerStop(() => {
      onTriggerStop();
    });
    const offTriggerCancel = api.onTriggerCancel(() => api.cancel());
    const handleKeyDown = (e: KeyboardEvent): void => {
      onKeyDown(e);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      offTriggerStop();
      offTriggerCancel();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <RecordingHud
      label={t.hudLabel}
      badge={t.recBadge}
      seconds={seconds}
      busyMessage={phase === 'saving' ? t.saving : undefined}
      cancel={{
        label: t.cancel,
        title: t.cancelTitle,
        onClick: () => window.videoRecorder.cancel(),
      }}
      stop={{ label: t.stop, title: t.stopTitle, onClick: requestStop }}
    />
  );
}
