import type { JSX, ReactNode } from 'react';
import { HOTKEY_DISABLED } from '../../../../shared/editor-hotkeys';
import { dashPattern } from '../../lib/dash';
import type { DashStyle } from '../../types/shapes';

export function ToolButton({
  label,
  shortcut,
  active,
  onClick,
}: {
  label: string;
  /** 키 이름('V' …). HOTKEY_DISABLED('') 면 해제된 도구 — 표기 없이 라벨만. */
  shortcut: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  const hasShortcut = shortcut !== HOTKEY_DISABLED;
  return (
    <button
      type="button"
      className={`tool ${active ? 'tool--active' : ''}`}
      onClick={onClick}
      title={hasShortcut ? `${label} (${shortcut})` : label}
    >
      <span className="tool__label">{label}</span>
      {/* 해제돼도 빈 span 을 유지해 버튼 높이가 다른 버튼과 같게 둔다. */}
      <span className="tool__shortcut">{hasShortcut ? shortcut : '\u00a0'}</span>
    </button>
  );
}

/**
 * 선 스타일 미리보기 — 실제 dash 패턴을 가로선 SVG 로 그린다.
 * 패턴은 `dashPattern` 을 그대로 재사용해 캔버스 렌더와 동일한 비율을 보장한다
 * (미리보기 전용 stroke 폭 2 기준). solid 는 dash 없음.
 */
export function DashPreview({ style }: { style: DashStyle }): JSX.Element {
  const pattern = dashPattern(style, 2);
  return (
    <svg width="36" height="20" viewBox="0 0 36 20" aria-hidden="true">
      <line
        x1="3"
        y1="10"
        x2="33"
        y2="10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={pattern ? pattern.join(' ') : undefined}
      />
    </svg>
  );
}

export function ToolbarButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      className="iconbtn"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={`${label} (${shortcut})`}
    >
      {children}
    </button>
  );
}

/**
 * 숫자 값 버튼 묶음 (블러 강도·블록 크기·폰트 크기·줄간격) — 라벨 + 값마다 버튼 1개.
 * 활성 값은 radius--active.
 */
export function ValueButtons({
  label,
  values,
  active,
  onPick,
  titleOf,
}: {
  label: string;
  values: readonly number[];
  active: number;
  onPick: (v: number) => void;
  titleOf: (v: number) => string;
}): JSX.Element {
  return (
    <div className="toolbar__group toolbar__group--slider">
      <span className="slider-label">{label}</span>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          className={`radius ${active === v ? 'radius--active' : ''}`}
          onClick={(): void => onPick(v)}
          title={titleOf(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
