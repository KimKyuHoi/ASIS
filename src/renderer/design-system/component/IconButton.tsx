import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';
import { cx } from '../lib/cx';
import '../asset/icon-button.css';

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-label'> & {
  /** 보이는 글자가 없으므로 필수 — 스크린리더 이름이자 툴팁. */
  label: string;
  icon: ReactNode;
  /** 도구 선택처럼 켜짐/꺼짐이 있는 버튼이면 지정 → aria-pressed. */
  pressed?: boolean;
  tone?: 'default' | 'hud';
};

/** 아이콘만 있는 버튼. 툴바·HUD·행 끝 동작에 쓴다. */
export function IconButton({
  label,
  icon,
  pressed,
  tone = 'default',
  className,
  ...rest
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cx('ds-icon-button', tone === 'hud' && 'ds-icon-button--hud', className)}
      {...rest}
    >
      {icon}
    </button>
  );
}
