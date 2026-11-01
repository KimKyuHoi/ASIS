import type { JSX } from 'react';
import type { GifStudioMedia } from '../../../../main/gif-studio/types';
import type { ExportSettings } from '../../lib/export-settings';
import { DimensionFields } from './DimensionFields';
import { OutputFields } from './OutputFields';

/**
 * 출력 설정 — 레퍼런스 변환 UI 의 좌(크기·속도)/우(FPS·품질·반복) 두 묶음.
 * 값 자체는 상위(Workspace)가 소유한다.
 */
export function ExportPanel({
  media,
  settings,
  onChange,
}: {
  media: GifStudioMedia;
  settings: ExportSettings;
  onChange: (next: ExportSettings) => void;
}): JSX.Element {
  const patch = (p: Partial<ExportSettings>): void => onChange({ ...settings, ...p });
  return (
    <div className="export-panel">
      <section className="export-panel__column">
        <DimensionFields media={media} settings={settings} onPatch={patch} />
      </section>
      <section className="export-panel__column">
        <OutputFields settings={settings} onPatch={patch} />
      </section>
    </div>
  );
}
