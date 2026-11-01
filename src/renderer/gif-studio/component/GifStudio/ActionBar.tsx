import type { JSX } from 'react';
import type { GifExportTarget } from '../../../../main/gif-studio/types';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { formatBytes, formatDuration } from '../../lib/format-media';
import { gifStudioStrings } from '../../lib/strings';

/** 하단 바 — 예상 크기·길이 + [닫기] [다른 이름으로] [폴더에 저장] [클립보드에 복사]. */
export function ActionBar({
  estimatedBytes,
  duration,
  busy,
  onClose,
  onExport,
}: {
  estimatedBytes: number;
  duration: number;
  busy: boolean;
  onClose: () => void;
  onExport: (target: GifExportTarget) => void;
}): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  return (
    <footer className="action-bar">
      <div className="action-bar__info">
        <span>{t.estimatedSize(formatBytes(estimatedBytes))}</span>
        <span>{`${t.duration} ${formatDuration(duration)}`}</span>
        <span className="action-bar__hint">{t.annotationHint}</span>
      </div>
      <div className="action-bar__buttons">
        <button type="button" className="mac-btn" onClick={onClose}>
          {t.close}
        </button>
        <button
          type="button"
          className="mac-btn"
          disabled={busy}
          onClick={(): void => onExport('save-as')}
        >
          {t.saveAs}
        </button>
        <button
          type="button"
          className="mac-btn"
          disabled={busy}
          onClick={(): void => onExport('folder')}
        >
          {t.saveFolder}
        </button>
        <button
          type="button"
          className="mac-btn mac-btn--primary"
          disabled={busy}
          onClick={(): void => onExport('clipboard')}
        >
          {t.copy}
        </button>
      </div>
    </footer>
  );
}
