import { useEffect, useState, type JSX } from 'react';
import { useLanguage } from '../../../shared/i18n/use-language';
import { RecordingHud } from '../../design-system/component';
import { useRecordingProgress } from '../hook/useRecordingProgress';
import { recorderStrings } from '../lib/strings';

type Phase = 'recording' | 'encoding';

/**
 * 녹화 컨트롤 윈도우 — 작은 floating bar.
 *
 * 상태
 *   - recording: REC 점멸 + mm:ss 타이머 + frame 수 + 정지/취소 버튼 (design-system RecordingHud)
 *   - encoding: 스피너 + "GIF 만드는 중…" — 사용자가 정지 누른 후, ffmpeg
 *               2-pass 인코딩이 끝날 때까지 (수 초). 끝나면 main 이 윈도우 close.
 */
export default function Recorder(): JSX.Element {
  const t = recorderStrings[useLanguage()];
  const [phase, setPhase] = useState<Phase>('recording');
  const { seconds, frames } = useRecordingProgress(phase === 'recording');

  // main → renderer: 인코딩 시작 알림 + 외부 trigger (글로벌 단축키 등).
  useEffect(() => {
    const api = window.recorder;
    // IPC 구독 — teardown 에서 모두 해제 (Strict Mode 이중 마운트 시 중복 등록 방지).
    const offEncoding = api.onEncoding(() => setPhase('encoding'));
    const offTriggerStop = api.onTriggerStop(() => api.stop());
    const offTriggerCancel = api.onTriggerCancel(() => api.cancel());
    return () => {
      offEncoding();
      offTriggerStop();
      offTriggerCancel();
    };
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

  const busy = phase === 'encoding';
  return (
    <RecordingHud
      label={t.hudLabel}
      badge={t.recBadge}
      seconds={seconds}
      detail={busy ? t.encodingFrames(frames) : t.frames(frames)}
      busyMessage={busy ? t.encoding : undefined}
      cancel={{ label: t.cancel, title: t.cancelTitle, onClick: () => window.recorder.cancel() }}
      stop={{ label: t.stop, title: t.stopTitle, onClick: () => window.recorder.stop() }}
    />
  );
}
