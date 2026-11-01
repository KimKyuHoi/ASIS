import { useEffect, useRef, useState, type JSX } from 'react';
import { useLanguage } from '../../../shared/i18n/use-language';
import { Button, EmptyState, Icon, Toast } from '../../design-system/component';
import { useCopyFeedback } from '../hook/useCopyFeedback';
import { useHistoryEntries } from '../hook/useHistoryEntries';
import { formatTimestamp } from '../lib/format-time';
import { historyStrings } from '../lib/strings';
import type { HistoryEntry } from '../types/history-entry';

const EDIT_FAILED_MS = 3000;

export default function History(): JSX.Element {
  const lang = useLanguage();
  const t = historyStrings[lang];
  const { entries, reload } = useHistoryEntries();
  const { copying, copy: handleCopy } = useCopyFeedback();
  // [편집] 실패 알림 — 편집본이 그사이 떨어져 나간 경우 등. 새로 띄우면 이전 타이머를 지운다.
  const [editFailed, setEditFailed] = useState(false);
  const editFailedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (editFailedTimer.current !== null) clearTimeout(editFailedTimer.current);
  }, []);

  const handlePin = (entry: HistoryEntry): void => {
    window.captureHistory.pin(entry.dataUrl, entry.width, entry.height).catch((err: unknown) => {
      console.error('[asis history] pin failed', err);
    });
  };

  const handleEdit = (entry: HistoryEntry): void => {
    window.captureHistory.edit(entry.id).catch((err: unknown) => {
      console.error('[asis history] edit failed', err);
      if (editFailedTimer.current !== null) clearTimeout(editFailedTimer.current);
      setEditFailed(true);
      editFailedTimer.current = setTimeout(() => setEditFailed(false), EDIT_FAILED_MS);
      // 표시가 실제와 어긋났을 가능성이 크다 — 목록을 다시 받는다.
      reload();
    });
  };

  if (entries.length === 0) {
    return (
      <div className="history history--empty">
        <EmptyState icon={<Icon name="photo" size={32} />} title={t.emptyText} description={t.emptyHint} />
      </div>
    );
  }

  return (
    <div className="history">
      {editFailed ? (
        <div className="history__toast">
          <Toast tone="danger" title={t.editFailedTitle} description={t.editFailedHint} />
        </div>
      ) : null}
      <h1 className="history__title">{t.title(entries.length)}</h1>
      <ul className="history__grid">
        {entries.map((entry) => {
          const time = formatTimestamp(entry.timestamp, lang);
          const copied = copying === entry.id;
          return (
            <li key={entry.id} className="history-card">
              <div className="history-card__thumb-wrap">
                <img
                  className="history-card__thumb"
                  src={entry.dataUrl}
                  alt={t.thumbAlt(time)}
                  loading="lazy"
                />
              </div>
              <div className="history-card__footer">
                <time className="history-card__time tabular">{time}</time>
                <div className="history-card__actions">
                  <Button
                    icon={<Icon name={copied ? 'check' : 'copy'} size={12} />}
                    onClick={(): void => handleCopy(entry)}
                    title={t.copyTitle}
                  >
                    {t.copy}
                  </Button>
                  <Button onClick={(): void => handlePin(entry)} title={t.pinTitle}>
                    {t.pin}
                  </Button>
                  {entry.editable ? (
                    <Button onClick={(): void => handleEdit(entry)} title={t.editTitle}>
                      {t.edit}
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
