import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';
import { cx } from '../lib/cx';
import '../asset/hud.css';

type HudPillProps = {
  /** 무엇을 조작하는 묶음인지 (예: "녹화 제어") */
  label: string;
  children: ReactNode;
  className?: string;
};

/** 화면 위에 떠 있는 알약 — 녹화·스텝 가이드 HUD. 항상 어둡다. */
export function HudPill({ label, children, className }: HudPillProps): JSX.Element {
  return (
    <div role="group" aria-label={label} className={cx('ds-hud-pill', className)}>
      {children}
    </div>
  );
}

type HudButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  /** stop = 녹화 정지 (캡처 프레임의 녹화 빨강) */
  variant?: 'default' | 'stop';
  icon?: ReactNode;
};

export function HudButton({
  variant = 'default',
  icon,
  className,
  children,
  ...rest
}: HudButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={cx('ds-hud-button', variant === 'stop' && 'ds-hud-button--stop', className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/** 녹화 중 표시 점. 상태는 옆의 텍스트(경과 시간 등)가 전달하므로 장식으로 숨긴다. */
export function RecDot(): JSX.Element {
  return <span className="ds-rec-dot" aria-hidden="true" />;
}

/** 처리 중 표시 — HUD 위의 작은 원형 스피너. 옆 문구가 상태를 전하므로 장식으로 숨긴다. */
export function HudSpinner(): JSX.Element {
  return <span className="ds-hud-spinner" aria-hidden="true" />;
}
