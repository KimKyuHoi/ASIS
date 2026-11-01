import { useId, type InputHTMLAttributes, type JSX } from 'react';
import { cx } from '../lib/cx';
import '../asset/checkbox.css';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** 보조 설명 — aria-describedby 로 연결된다. */
  hint?: string;
};

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  className,
  id,
  ...rest
}: CheckboxProps): JSX.Element {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  return (
    <span className={cx('ds-checkbox', className)}>
      <input
        id={inputId}
        type="checkbox"
        className="ds-checkbox__input"
        checked={checked}
        aria-describedby={hint === undefined ? undefined : hintId}
        onChange={(event): void => {
          onChange(event.target.checked);
        }}
        {...rest}
      />
      <span className="ds-checkbox__text">
        <label htmlFor={inputId}>{label}</label>
        {hint === undefined ? null : (
          <span id={hintId} className="ds-checkbox__hint">
            {hint}
          </span>
        )}
      </span>
    </span>
  );
}
