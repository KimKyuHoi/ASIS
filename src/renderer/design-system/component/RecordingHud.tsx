import type { JSX } from 'react';
import { HudButton, HudPill, HudSpinner, RecDot } from './Hud';
import '../asset/recording-hud.css';

type HudAction = {
  label: string;
  /** 툴팁 — 단축키를 함께 적는다 (예: "정지 (Enter)") */
  title: string;
  onClick: () => void;
};

type RecordingHudProps = {
  /** 알약 전체의 접근성 이름 (예: "GIF 녹화") */
  label: string;
  /** 녹화 중 배지 글자 (예: "REC") */
  badge: string;
  /** 경과 초 — mm:ss 로 보인다 */
  seconds: number;
  /** 시간 옆 보조 정보 (예: "120프레임") */
  detail?: string;
  /** 보조 정보에 마우스를 올리면 보이는 설명 (예: 수동 모드인 이유) */
  detailTitle?: string;
  /** 지정하면 녹화가 끝나고 처리 중인 상태 — 스피너 + 이 문구, 버튼은 숨긴다 */
  busyMessage?: string;
  cancel: HudAction;
  stop: HudAction;
};

/** 경과 초 → mm:ss. */
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * 녹화 알약 — GIF 녹화·화면 녹화가 같은 모양을 쓴다. 항상 다크(HudPill).
 * 시간은 매초 바뀌므로 aria-live 로 읽히지 않게 두고, 처리 중 문구만 status 로 알린다.
 */
export function RecordingHud({
  label,
  badge,
  seconds,
  detail,
  detailTitle,
  busyMessage,
  cancel,
  stop,
}: RecordingHudProps): JSX.Element {
  if (busyMessage !== undefined) {
    return (
      <HudPill label={label} className="ds-recording-hud ds-recording-hud--busy">
        <HudSpinner />
        <span role="status" className="ds-recording-hud__busy">
          {busyMessage}
          {detail === undefined ? null : <span className="ds-recording-hud__detail">{detail}</span>}
        </span>
      </HudPill>
    );
  }
  return (
    <HudPill label={label} className="ds-recording-hud">
      <span className="ds-recording-hud__badge">
        <RecDot />
        {badge}
      </span>
      <span className="ds-recording-hud__time tabular">{formatElapsed(seconds)}</span>
      {detail === undefined ? null : (
        <span className="ds-recording-hud__detail tabular" title={detailTitle}>{detail}</span>
      )}
      <span className="ds-recording-hud__actions">
        <HudButton title={cancel.title} onClick={cancel.onClick}>
          {cancel.label}
        </HudButton>
        <HudButton variant="stop" title={stop.title} onClick={stop.onClick}>
          {stop.label}
        </HudButton>
      </span>
    </HudPill>
  );
}
