import type { JSX } from 'react';
import { useStepCount } from '../hook/useStepCount';

/**
 * 스텝 가이드 녹화 컨트롤 — 작은 floating bar (video-recorder HUD 결).
 *
 * 표시:
 *   - REC 점멸 + "N단계 기록됨" 카운터(main 이 클릭마다 push).
 *   - "MD 저장" / "HTML 저장" 버튼 — 각각 그 형식으로 종료·export.
 *
 * 동작은 전부 main 이 소유한다(전역 클릭 탭·캡처·export). 이 창은 상태 표시 +
 * 종료 형식 선택만 담당한다. 종료 후 main 이 이 창을 닫는다.
 *
 * react-compiler.md — useMemo/useCallback 미사용. 인라인 핸들러 그대로.
 */
export default function StepGuide(): JSX.Element {
  const stepCount = useStepCount();

  const stop = (format: 'markdown' | 'html'): void => {
    const api = window.stepGuide;
    if (!api) throw new Error('window.stepGuide 미노출 — preload 셋업 확인.');
    api.stop(format);
  };

  return (
    <div className="sg">
      <div className="sg__indicator" aria-hidden="true">
        <span className="sg__dot" />
        REC
      </div>
      <div className="sg__count">{stepCount}단계 기록됨</div>
      <button
        type="button"
        className="sg__btn"
        onClick={(): void => stop('markdown')}
        title="Markdown 으로 저장하고 종료"
      >
        MD 저장
      </button>
      <button
        type="button"
        className="sg__btn sg__btn--primary"
        onClick={(): void => stop('html')}
        title="HTML 으로 저장하고 종료"
      >
        HTML 저장
      </button>
    </div>
  );
}
