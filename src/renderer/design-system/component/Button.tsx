import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';
import { cx } from '../lib/cx';
import '../asset/button.css';

export type ButtonVariant = 'secondary' | 'primary' | 'destructive' | 'plain';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  /** primary 는 창마다 하나(기본 동작). destructive 는 되돌릴 수 없는 동작. */
  variant?: ButtonVariant;
  size?: 'regular' | 'large';
  icon?: ReactNode;
  type?: 'button' | 'submit' | 'reset';
};

/** macOS 푸시 버튼. 폼 안에서 실수로 submit 되지 않도록 type 기본값은 'button'. */
export function Button({
  variant = 'secondary',
  size = 'regular',
  icon,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = cx(
    'ds-button',
    `ds-button--${variant}`,
    size === 'large' && 'ds-button--large',
    className,
  );
  return (
    <button type={type} className={classes} {...rest}>
      {icon === undefined ? null : <span className="ds-button__icon">{icon}</span>}
      {children}
    </button>
  );
}
