import type { JSX } from 'react';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { FPS_MAX, FPS_MIN, type ExportSettings } from '../../lib/export-settings';
import { gifStudioStrings } from '../../lib/strings';

/** FPS · 품질. 내보낸 GIF 는 항상 무한 반복한다. */
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
    </>
  );
}
