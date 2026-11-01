import { useId, type CSSProperties, type JSX } from 'react';
import { cx } from '../lib/cx';
import '../asset/slider.css';

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** 오른쪽에 보이는 현재 값 (예: v => `${v}%`). aria-valuetext 로도 쓰인다. */
  format?: (value: number) => string;
  disabled?: boolean;
  /** 라벨을 시각적으로 숨긴다 (Row 라벨이 이미 보일 때). */
  hideLabel?: boolean;
  className?: string;
};

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = String,
  disabled,
  hideLabel,
  className,
}: SliderProps): JSX.Element {
  const id = useId();
  if (max <= min) throw new Error(`Slider: max(${max}) 가 min(${min}) 보다 커야 한다`);
  const progress = ((value - min) / (max - min)) * 100;
  const style = { '--ds-slider-progress': `${progress}%` } as CSSProperties;
  return (
    <span className={cx('ds-slider', className)}>
      <label htmlFor={id} className={hideLabel === true ? 'ds-visually-hidden' : 'ds-slider__label'}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="ds-slider__input"
        style={style}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format(value)}
        onChange={(event): void => {
          onChange(Number(event.target.value));
        }}
      />
      <output htmlFor={id} className="ds-slider__value tabular">
        {format(value)}
      </output>
    </span>
  );
}
