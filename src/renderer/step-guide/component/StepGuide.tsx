import type { JSX } from 'react';
import { useLanguage } from '../../../shared/i18n/use-language';
import { useStepGuideState } from '../hook/useStepGuideState';
import { stepGuideStrings } from '../lib/strings';

/**
 * 스텝 가이드 녹화 컨트롤 — 작은 floating bar (video-recorder HUD 결).
 *
 * 수동 이미지/GIF 모드:
 *   - 이미지 모드(기본): 전역 클릭마다 그 순간 정지 캡처 → 이미지 스텝.
 *   - [GIF 시작] → 그때부터 [GIF 정지]까지 전체를 하나의 연속 GIF 로 녹화 → GIF 스텝.
 *     GIF 녹화 중이면 버튼이 [GIF 정지]로 바뀌고 "● GIF 녹화 중" 표시가 뜬다.
 *   - "MD 저장" / "HTML 저장" — 각각 그 형식으로 종료·export.
 *
 * 동작은 전부 main 이 소유한다(전역 클릭 탭·캡처·GIF 인코딩·export). 이 창은 상태
 * 표시 + 명령(GIF 시작/정지, 종료 형식 선택)만 담당한다. 종료 후 main 이 이 창을 닫는다.
 *
 * react-compiler.md — useMemo/useCallback 미사용. 인라인 핸들러 그대로.
 */
export default function StepGuide(): JSX.Element {
  const t = stepGuideStrings[useLanguage()];
  const { stepCount, gifRecording } = useStepGuideState();

  const api = (): NonNullable<typeof window.stepGuide> => {
    const a = window.stepGuide;
    if (!a) throw new Error('window.stepGuide 미노출 — preload 셋업 확인.');
    return a;
  };

  const stop = (format: 'markdown' | 'html'): void => {
    api().stop(format);
  };

  const toggleGif = (): void => {
    if (gifRecording) api().stopGif();
    else api().startGif();
  };

  return (
    <div className="sg">
      <div className="sg__indicator" aria-hidden="true">
        <span className="sg__dot" />
        REC
      </div>
      {gifRecording ? (
        <div className="sg__gifstatus">{t.gifStatus}</div>
      ) : (
        <div className="sg__count">{t.stepCount(stepCount)}</div>
      )}
      <button
        type="button"
        className={`sg__btn${gifRecording ? ' sg__btn--rec' : ''}`}
        onClick={toggleGif}
        title={gifRecording ? t.gifStopTitle : t.gifStartTitle}
      >
        {gifRecording ? t.gifStop : t.gifStart}
      </button>
      <button
        type="button"
        className="sg__btn"
        onClick={(): void => stop('markdown')}
        title={t.saveMdTitle}
      >
        {t.saveMd}
      </button>
      <button
        type="button"
        className="sg__btn sg__btn--primary"
        onClick={(): void => stop('html')}
        title={t.saveHtmlTitle}
      >
        {t.saveHtml}
      </button>
    </div>
  );
}
