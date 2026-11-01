import type { JSX } from 'react';
import { HudButton, HudPill } from '../../design-system/component';

type Direction = 'up' | 'down';

type DirectionPickerProps = {
  label: string;
  prompt: string;
  up: { label: string; title: string };
  down: { label: string; title: string };
  cancel: { label: string; title: string; onClick: () => void };
  /** 고르지 않고 직접 스크롤한 뒤 끝낼 때 — 선택 화면에도 정지가 있어야 한다. */
  stop: { label: string; title: string; onClick: () => void };
  onChoose: (direction: Direction) => void;
};

/**
 * 자동 스크롤 방향 선택 알약 — Snagit 처럼 시작할 때 화살표로 방향을 고른다.
 * 고르기 전에도 캡처는 돌고 있어서, 사용자가 그냥 직접 스크롤해도 된다.
 */
export function DirectionPicker({
  label,
  prompt,
  up,
  down,
  cancel,
  stop,
  onChoose,
}: DirectionPickerProps): JSX.Element {
  return (
    <HudPill label={label} className="scroll-capture-picker">
      <span className="scroll-capture-picker__prompt">{prompt}</span>
      <span className="scroll-capture-picker__actions">
        <HudButton title={up.title} onClick={(): void => onChoose('up')}>
          {up.label}
        </HudButton>
        <HudButton title={down.title} onClick={(): void => onChoose('down')}>
          {down.label}
        </HudButton>
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
