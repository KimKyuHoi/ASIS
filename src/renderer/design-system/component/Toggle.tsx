import { useId, type InputHTMLAttributes, type JSX } from 'react';
import { cx } from '../lib/cx';
import '../asset/toggle.css';

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 보이는 라벨. 없으면 aria-label 을 반드시 넘긴다 (Row 안에서 행 라벨이 대신하는 경우). */
  label?: string;
};

/** 스위치 — 즉시 적용되는 켜기/끄기. 폼 제출 후 적용이면 Checkbox 를 쓴다. */
export function Toggle({
  checked,
  onChange,
  label,
  className,
  id,
  ...rest
}: ToggleProps): JSX.Element {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <span className={cx('ds-toggle', className)}>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        className="ds-toggle__input"
        checked={checked}
        aria-checked={checked}
        onChange={(event): void => {
          onChange(event.target.checked);
        }}
        {...rest}
      />
      <span className="ds-toggle__track" aria-hidden="true">
        <span className="ds-toggle__knob" />
      </span>
      {label === undefined ? null : (
        <label className="ds-toggle__label" htmlFor={inputId}>
          {label}
        </label>
      )}
    </span>
  );
}
