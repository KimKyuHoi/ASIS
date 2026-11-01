import type { JSX } from 'react';
import { useLanguage } from '../../../../shared/i18n/use-language';
import type { ExportBusy, ExportNotice } from '../../hook/useGifExport';
import { errorMessage, formatBytes } from '../../lib/format-media';
import { gifStudioStrings } from '../../lib/strings';

/** 내보내기 결과 알림 — 저장이면 [Finder 에서 보기]. */
export function NoticeToast({
  notice,
  onChange,
}: {
  notice: ExportNotice;
  onChange: (n: ExportNotice | null) => void;
}): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  const reveal = (path: string): void => {
    window.gifStudio.reveal(path).catch((err: unknown) => {
      onChange({ kind: 'error', message: errorMessage(err) });
    });
  };
  return (
    <div className={`toast${notice.kind === 'error' ? ' toast--error' : ''}`} role="status">
      {notice.kind === 'saved' ? (
        <>
          <span>{t.saved(notice.path)}</span>
          <button type="button" className="toast__action" onClick={(): void => reveal(notice.path)}>
            {t.reveal}
          </button>
        </>
      ) : null}
      {notice.kind === 'copied' ? <span>{t.copied(formatBytes(notice.size))}</span> : null}
      {notice.kind === 'error' ? <span>{t.exportFailed(notice.message)}</span> : null}
      <button type="button" className="toast__close" onClick={(): void => onChange(null)}>
        ×
      </button>
    </div>
  );
}

/** 내보내는 동안의 모달 — [취소] 는 main 의 ffmpeg 를 죽인다. */
export function BusyOverlay({
  busy,
  onCancel,
}: {
  busy: ExportBusy;
  onCancel: () => void;
}): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  // 주석을 다 구운 뒤에는 ffmpeg 인코딩 — 진행률을 모르므로 일반 문구.
  const baking = busy.total > 0 && busy.done < busy.total;
  return (
    <div className="busy" role="dialog" aria-modal="true">
      <div className="busy__card">
        <div className="spinner" aria-hidden="true" />
        <p>{baking ? t.baking(busy.done, busy.total) : t.exporting}</p>
        <button type="button" className="mac-btn" onClick={onCancel}>
          {t.cancelExport}
        </button>
      </div>
    </div>
  );
}
