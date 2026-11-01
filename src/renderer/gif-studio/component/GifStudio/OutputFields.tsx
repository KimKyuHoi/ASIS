import type { JSX } from 'react';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { FPS_MAX, FPS_MIN, type ExportSettings } from '../../lib/export-settings';
import { gifStudioStrings } from '../../lib/strings';
import { NumberField } from './NumberField';

/** FPS · 품질 · 재생 횟수/무한 반복/바운스. */
export function OutputFields({
  settings,
  onPatch,
}: {
  settings: ExportSettings;
  onPatch: (p: Partial<ExportSettings>) => void;
}): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  return (
    <>
      <label className="field">
        <span className="field__label">
          {t.fps}
          <output>{settings.fps}</output>
        </span>
        <input
          type="range"
          min={FPS_MIN}
          max={FPS_MAX}
          step={1}
          value={settings.fps}
          onChange={(e): void => onPatch({ fps: Number(e.currentTarget.value) })}
        />
      </label>

      <label className="field">
        <span className="field__label">
          {t.quality}
          <output>{`${settings.quality}%`}</output>
        </span>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={settings.quality}
          onChange={(e): void => onPatch({ quality: Number(e.currentTarget.value) })}
        />
      </label>

      <div className="field field--row">
        <label className="field__inline">
          <span className="field__label">{t.loops}</span>
          <NumberField
            min={1}
            max={1000}
            disabled={settings.loopForever}
            value={settings.plays}
            onCommit={(v): void => {
              // main 검증 범위(1~1000 정수) 안으로 맞춘다.
              onPatch({ plays: Math.min(1000, Math.max(1, Math.round(v))) });
            }}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.loopForever}
            onChange={(e): void => onPatch({ loopForever: e.currentTarget.checked })}
          />
          <span>{t.loopForever}</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.bounce}
            onChange={(e): void => onPatch({ bounce: e.currentTarget.checked })}
          />
          <span>{t.bounce}</span>
        </label>
      </div>
    </>
  );
}
