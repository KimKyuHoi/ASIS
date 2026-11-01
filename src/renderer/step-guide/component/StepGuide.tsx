import type { JSX } from 'react';
import { useLanguage } from '../../../shared/i18n/use-language';
import { HudButton, HudPill, RecDot } from '../../design-system/component';
import { useElapsedSeconds } from '../hook/useElapsedSeconds';
import { useStepGuideState } from '../hook/useStepGuideState';
import { stepGuideStrings } from '../lib/strings';
import '../../design-system/asset/recording-hud.css';
import '../asset/styles.css';

/** 경과 초 → mm:ss (RecordingHud 와 같은 표기). */
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * 스텝 가이드 녹화 알약 — GIF·화면 녹화·스크롤 캡처와 같은 녹화 알약 모양.
 *
 * design-system RecordingHud 는 [취소]·[정지] 두 버튼만 받으므로, 스텝 가이드의 [GIF]
 * 버튼을 함께 넣으려고 같은 부품(HudPill·HudButton·RecDot)과 같은 클래스(ds-recording-hud*)로
 * 조립했다 — 모양·간격·드래그 영역이 다른 녹화 알약과 같다.
 *
 *   REC · mm:ss · N단계(GIF 녹화 중이면 표시) · [GIF] [취소] [정지]
 *   - [GIF] → 그때부터 [GIF 정지]까지를 움직이는 한 단계로 녹화.
 *   - [취소]·ESC → 기록한 단계·임시 파일을 버린다(편집 창 없음).
 *   - [정지] → 녹화를 끝내고 편집 창을 연다.
 *
 * 동작은 전부 main 이 소유한다(전역 클릭 탭·캡처·GIF 인코딩·편집 창). 이 창은 표시와 명령만.
 * 알약 클릭은 단계로 기록되지 않는다 — 클릭 감지(NSEvent 전역 모니터)는 다른 앱 이벤트만 받는다.
 */
export default function StepGuide(): JSX.Element {
  const t = stepGuideStrings[useLanguage()];
  const { stepCount, gifRecording } = useStepGuideState();
  const seconds = useElapsedSeconds();

  const toggleGif = (): void => {
    if (gifRecording) window.stepGuide.stopGif();
    else window.stepGuide.startGif();
  };

  return (
    <HudPill label={t.hudLabel} className="ds-recording-hud sg">
      <span className="ds-recording-hud__badge">
        <RecDot />
        {t.rec}
      </span>
      <span className="ds-recording-hud__time tabular">{formatElapsed(seconds)}</span>
      <span className="ds-recording-hud__detail tabular" title={t.howTo}>
        {gifRecording ? t.stepCountGif(stepCount) : t.stepCount(stepCount)}
      </span>
      <span className="ds-recording-hud__actions">
        <HudButton
          variant={gifRecording ? 'stop' : 'default'}
          title={gifRecording ? t.gifStopTitle : t.gifStartTitle}
          onClick={toggleGif}
        >
          {gifRecording ? t.gifStop : t.gifStart}
        </HudButton>
        <HudButton title={t.cancelTitle} onClick={(): void => window.stepGuide.cancel()}>
          {t.cancel}
        </HudButton>
        <HudButton
          variant="stop"
          title={t.stopTitle}
          // preload 의 stop(format) 은 예전 MD/HTML 선택 시그니처 — main 은 인자를 무시한다.
          onClick={(): void => window.stepGuide.stop('html')}
        >
          {t.stop}
        </HudButton>
      </span>
    </HudPill>
  );
}
