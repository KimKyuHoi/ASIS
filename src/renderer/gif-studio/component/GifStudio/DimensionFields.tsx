import type { JSX } from 'react';
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

type Props = {
  media: GifStudioMedia;
  settings: ExportSettings;
  onPatch: (p: Partial<ExportSettings>) => void;
};

/** 크기 프리셋 · 너비/높이(픽셀) · 원본 비율 표시·복원 · 속도. */
export function DimensionFields({ media, settings, onPatch }: Props): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  // "비율 유지" 는 따로 상태를 두지 않고 지금 크기가 원본 비율인지를 그대로 보여 준다 —
  // 숫자를 고쳐 비율이 깨지면 저절로 꺼지고, 다시 체크하면 비율을 되돌린다.
  const keepsAspect = keepsRatio(media, settings);

  /** 너비를 기준으로 원본 비율에 맞춘 높이. */
  const ratioHeight = (width: number): number => clampSize((width / media.width) * media.height);

  // NumberField 가 blur·Enter 때만 부르므로 여기서 clamp 해도 입력 도중 값이 튀지 않는다.
  // 입력한 쪽만 바꾼다 — 다른 쪽을 따라 바꾸지 않아야 사용자가 일부러 비율을 깰 수 있다.
  const setWidth = (value: number): void => {
    if (value > 0) onPatch({ width: clampSize(value) });
  };

  const setHeight = (value: number): void => {
    if (value > 0) onPatch({ height: clampSize(value) });
  };

  return (
    <>
      <PresetSelect media={media} settings={settings} onPatch={onPatch} />
      <div className="field field--row">
        <label className="field__inline">
          <span className="field__label">{t.width}</span>
          <NumberField
            min={1}
            value={settings.width}
            onCommit={setWidth}
          />
        </label>
        <span className="field__times" aria-hidden="true">×</span>
        <label className="field__inline">
          <span className="field__label">{t.height}</span>
          <NumberField
            min={1}
            value={settings.height}
            onCommit={setHeight}
          />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={keepsAspect}
          onChange={(): void => {
            // 체크하면 깨진 비율을 되돌린다 — 너비는 두고 높이를 원본 비율로 맞춘다.
            // 이미 원본 비율이면 해제할 대상이 없다(숫자를 고치면 저절로 꺼진다).
            if (!keepsAspect) onPatch({ height: ratioHeight(settings.width) });
          }}
        />
        <span>{t.lockAspect}</span>
      </label>
      <SpeedSlider settings={settings} onPatch={onPatch} />
    </>
  );
}

/** 지금 크기가 원본 비율인지 — 정수 픽셀 반올림 오차(1px)는 같은 비율로 본다. */
function keepsRatio(media: GifStudioMedia, settings: ExportSettings): boolean {
  const expected = (settings.width / media.width) * media.height;
  return Math.abs(expected - settings.height) <= 1;
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
