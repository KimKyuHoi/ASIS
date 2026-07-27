import type { JSX } from 'react';
import { useLanguage } from '../../../shared/i18n/use-language';
import { useElapsedSeconds } from '../hook/useElapsedSeconds';
import { useTimeMachineHudState } from '../hook/useTimeMachineHudState';
import { formatDuration } from '../lib/format-time';
import { timeMachineHudStrings } from '../lib/strings';

/**
 * 타임머신 상태 알약 — 상시 녹화 중 화면에 계속 떠 있는 작은 floating bar.
 *
 * 알림 배너는 몇 초 뒤 사라져 "지금 켜져 있나?" 를 확인할 방법이 없었다. 이 알약은
 * 녹화가 도는 내내 남아 경과 시간·버퍼 길이를 보여주고, 저장/정지를 그 자리에서
 * 누를 수 있게 한다.
 *
 * 상태는 전부 main 이 소유한다 (녹화 프로세스의 진실은 main 에만 있다). 여기서는
 * push 받은 phase 를 그리기만 하고, 버튼은 main 으로 요청만 보낸다.
 */
export default function TimeMachineHud(): JSX.Element | null {
  const t = timeMachineHudStrings[useLanguage()];
  const state = useTimeMachineHudState();
  // 훅은 조건부 호출 불가 — state 가 없을 때도 호출하고 내부에서 멈춘다.
  const elapsed = useElapsedSeconds(
    state ? state.startedAt : null,
    state?.phase.kind === 'recording',
  );

  // main 의 첫 push 전(핸드셰이크 수십 ms). 그릴 상태가 없으므로 아무것도 안 그린다 —
  // 창 배경이 투명이라 사용자에게는 알약이 조금 늦게 나타나는 것으로만 보인다.
  if (!state) return null;

  const phase = state.phase;

  if (phase.kind === 'saving') {
    return (
      <div className="tmhud tmhud--busy">
        <span className="tmhud__spinner" aria-hidden="true" />
        <span className="tmhud__status">{t.saving}</span>
      </div>
    );
  }

  if (phase.kind === 'saved') {
    return (
      <div className="tmhud tmhud--done">
        <span className="tmhud__check" aria-hidden="true">
          ✓
        </span>
        <span className="tmhud__status">{t.savedLabel}</span>
        <span className="tmhud__meta">{t.savedMeta(phase.seconds)}</span>
        <button
          type="button"
          className="tmhud__btn"
          onClick={(): void => window.timeMachineHud.reveal()}
          title={t.revealTitle}
        >
          {t.reveal}
        </button>
      </div>
    );
  }

  if (phase.kind === 'notice') {
    return (
      <div className="tmhud tmhud--busy">
        <span className="tmhud__info" aria-hidden="true">
          ⓘ
        </span>
        <span className="tmhud__status">{phase.message}</span>
      </div>
    );
  }

  return (
    <div className="tmhud">
      <span className="tmhud__dot" aria-hidden="true" />
      <span className="tmhud__label">{t.label}</span>
      <span className="tmhud__time">{formatDuration(elapsed)}</span>
      <span className="tmhud__meta">{t.buffer(state.bufferSeconds)}</span>
      <button
        type="button"
        className="tmhud__btn tmhud__btn--save"
        onClick={(): void => window.timeMachineHud.save()}
        title={t.saveTitle}
      >
        {t.save}
      </button>
      <button
        type="button"
        className="tmhud__btn"
        onClick={(): void => window.timeMachineHud.stop()}
        title={t.stopTitle}
      >
        {t.stop}
      </button>
    </div>
  );
}
