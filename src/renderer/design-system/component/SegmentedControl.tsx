import { useId, type JSX } from 'react';
import type { SelectOption } from '../types/design-system';
import { cx } from '../lib/cx';
import '../asset/segmented-control.css';

type SegmentedControlProps<V extends string> = {
  /** 그룹 이름 — 화면에 안 보이면 스크린리더용으로만 쓰인다. */
  label: string;
  value: V;
  options: readonly SelectOption<V>[];
  onChange: (value: V) => void;
  className?: string;
};

/**
 * 세그먼트 컨트롤 — 2~5개 중 하나를 고른다. 네이티브 radio 를 써서
 * 화살표 키 이동·Tab 한 번 진입·스크린리더 "n개 중 m번째"를 브라우저가 처리한다.
 */
export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<V>): JSX.Element {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cx('ds-segmented', className)}>
      {options.map((option) => (
        <label key={option.value} className="ds-segmented__item">
          <input
            type="radio"
            className="ds-segmented__input"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={(): void => {
              onChange(option.value);
            }}
          />
          <span className="ds-segmented__label">{option.label}</span>
        </label>
      ))}
    </div>
  );
}
