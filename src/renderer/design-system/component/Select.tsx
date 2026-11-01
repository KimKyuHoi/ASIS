import type { ChangeEvent, JSX, SelectHTMLAttributes } from 'react';
import type { SelectOption } from '../types/design-system';
import { cx } from '../lib/cx';
import '../asset/select.css';

type SelectProps<V extends string> = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'onChange' | 'children'
> & {
  value: V;
  options: readonly SelectOption<V>[];
  onChange: (value: V) => void;
};

/**
 * 팝업 버튼. 네이티브 <select> 를 그대로 쓴다 — Electron 에서 macOS 네이티브 메뉴가 뜨고
 * 키보드·스크린리더 동작을 공짜로 얻는다. 라벨은 <Row htmlFor> 나 aria-label 로 붙인다.
 */
export function Select<V extends string>({
  value,
  options,
  onChange,
  className,
  ...rest
}: SelectProps<V>): JSX.Element {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const picked = options.find((option) => option.value === event.target.value);
    if (!picked) throw new Error(`Select: 목록에 없는 값 "${event.target.value}"`);
    onChange(picked.value);
  };
  return (
    <span className={cx('ds-select', className)}>
      <select className="ds-select__native" value={value} onChange={handleChange} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <svg className="ds-select__chevron" width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
        <path d="M1 4.5 4 1.5 7 4.5M1 7.5 4 10.5 7 7.5" />
      </svg>
    </span>
  );
}
