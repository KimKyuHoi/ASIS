import { useId, type InputHTMLAttributes, type JSX } from 'react';
import { cx } from '../lib/cx';
import '../asset/text-field.css';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  /** 있으면 aria-invalid + 오류 문구. 무엇이 틀렸고 어떻게 고치는지 쓴다. */
  error?: string;
  hideLabel?: boolean;
};

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  hideLabel,
  className,
  id,
  ...rest
}: TextFieldProps): JSX.Element {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error === undefined ? hint && `${inputId}-hint` : `${inputId}-error`;
  return (
    <span className={cx('ds-field', className)}>
      <label htmlFor={inputId} className={hideLabel === true ? 'ds-visually-hidden' : 'ds-field__label'}>
        {label}
      </label>
      <input
        id={inputId}
        className="ds-field__input"
        value={value}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        onChange={(event): void => {
          onChange(event.target.value);
        }}
        {...rest}
      />
      {error === undefined ? null : (
        <span id={`${inputId}-error`} className="ds-field__error" role="alert">
          {error}
        </span>
      )}
      {error === undefined && hint !== undefined ? (
        <span id={`${inputId}-hint`} className="ds-field__hint">
          {hint}
        </span>
      ) : null}
    </span>
  );
}
