import { useState, type JSX } from 'react';
import type { GifStudioMedia } from '../../../../main/gif-studio/types';
import { useLanguage } from '../../../../shared/i18n/use-language';
import {
  DIMENSION_SCALES,
  SPEED_STEPS,
  clampSize,
  scaledSize,
  type ExportSettings,
} from '../../lib/export-settings';
import { gifStudioStrings } from '../../lib/strings';
import { NumberField } from './NumberField';

type Unit = 'px' | '%';
type Props = {
  media: GifStudioMedia;
  settings: ExportSettings;
  onPatch: (p: Partial<ExportSettings>) => void;
};

/** 크기 프리셋 · 너비/높이(픽셀|퍼센트, 비율 고정) · 속도. */
export function DimensionFields({ media, settings, onPatch }: Props): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  const [unit, setUnit] = useState<Unit>('px');
  const [lockAspect, setLockAspect] = useState(true);

  const toDisplay = (px: number, original: number): number =>
    unit === 'px' ? px : Math.round((px / original) * 1000) / 10;
  const fromDisplay = (value: number, original: number): number =>
    unit === 'px' ? value : (value / 100) * original;

  // NumberField 가 blur·Enter 때만 부르므로 여기서 clamp 해도 입력 도중 값이 튀지 않는다.
  const setWidth = (value: number): void => {
    if (value <= 0) return;
    const width = clampSize(fromDisplay(value, media.width));
    const height = lockAspect ? clampSize((width / media.width) * media.height) : settings.height;
    onPatch({ width, height });
  };

  const setHeight = (value: number): void => {
    if (value <= 0) return;
    const height = clampSize(fromDisplay(value, media.height));
    const width = lockAspect ? clampSize((height / media.height) * media.width) : settings.width;
    onPatch({ width, height });
  };

  return (
    <>
      <PresetSelect media={media} settings={settings} onPatch={onPatch} />
      <div className="field field--row">
        <label className="field__inline">
          <span className="field__label">{t.width}</span>
          <NumberField
            min={1}
            value={toDisplay(settings.width, media.width)}
            onCommit={setWidth}
          />
        </label>
        <span className="field__times" aria-hidden="true">×</span>
        <label className="field__inline">
          <span className="field__label">{t.height}</span>
          <NumberField
            min={1}
            value={toDisplay(settings.height, media.height)}
            onCommit={setHeight}
          />
        </label>
        <select
          className="mac-select field__unit"
          value={unit}
          onChange={(e): void => setUnit(e.currentTarget.value === '%' ? '%' : 'px')}
        >
          <option value="px">{t.unitPixels}</option>
          <option value="%">{t.unitPercent}</option>
        </select>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={lockAspect}
          onChange={(e): void => setLockAspect(e.currentTarget.checked)}
        />
        <span>{t.lockAspect}</span>
      </label>
      <SpeedSlider settings={settings} onPatch={onPatch} />
    </>
  );
}

function PresetSelect({ media, settings, onPatch }: Props): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  const matched = DIMENSION_SCALES.find((scale) => {
    const size = scaledSize(media, scale);
    return size.width === settings.width && size.height === settings.height;
  });
  return (
    <label className="field">
      <span className="field__label">{t.dimensions}</span>
      <select
        className="mac-select"
        value={matched === undefined ? 'custom' : String(matched)}
        onChange={(e): void => {
          const v = e.currentTarget.value;
          if (v !== 'custom') onPatch(scaledSize(media, Number(v)));
        }}
      >
        {DIMENSION_SCALES.map((scale) => {
          const size = scaledSize(media, scale);
          const name = scale === 1 ? t.original : t.scaleOption(Math.round(scale * 100));
          return (
            <option key={scale} value={String(scale)}>
              {`${size.width} × ${size.height} (${name})`}
            </option>
          );
        })}
        <option value="custom" disabled>{t.custom}</option>
      </select>
    </label>
  );
}

function SpeedSlider({ settings, onPatch }: Omit<Props, 'media'>): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  const index = SPEED_STEPS.findIndex((s) => s === settings.speed);
  if (index < 0) throw new Error(`SpeedSlider — SPEED_STEPS 에 없는 속도: ${settings.speed}`);
  return (
    <label className="field">
      <span className="field__label">
        {t.speed}
        <output>{`${settings.speed}×`}</output>
      </span>
      <input
        type="range"
        min={0}
        max={SPEED_STEPS.length - 1}
        step={1}
        value={index}
        onChange={(e): void => onPatch({ speed: SPEED_STEPS[Number(e.currentTarget.value)] })}
      />
    </label>
  );
}
