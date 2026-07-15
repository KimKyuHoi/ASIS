import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useLanguage } from '../../../shared/i18n/use-language';
import { formatTimestamp } from '../lib/format-time';
import { historyStrings } from '../lib/strings';

type HistoryEntry = {
  id: string;
  dataUrl: string;
  timestamp: number;
  width: number;
  height: number;
};

export default function History(): JSX.Element {
  const lang = useLanguage();
  const t = historyStrings[lang];
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [copying, setCopying] = useState<string | null>(null);

  useEffect(() => {
    window.captureHistory.list().then((list) => {
      setEntries(list);
    }).catch((err: unknown) => {
      console.error('[asis history] list failed', err);
    });
  }, []);

  const handleCopy = (entry: HistoryEntry): void => {
    setCopying(entry.id);
    window.captureHistory.copy(entry.dataUrl).then(() => {
      setTimeout(() => setCopying(null), 800);
    }).catch((err: unknown) => {
      console.error('[asis history] copy failed', err);
      setCopying(null);
    });
  };

  const handlePin = (entry: HistoryEntry): void => {
    window.captureHistory.pin(entry.dataUrl, entry.width, entry.height).catch((err: unknown) => {
      console.error('[asis history] pin failed', err);
    });
  };

  if (entries.length === 0) {
    return (
      <div className="history history--empty">
        <p className="history__empty-text">{t.emptyText}</p>
        <p className="history__empty-hint">{t.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="history">
      <h1 className="history__title">{t.title(entries.length)}</h1>
      <div className="history__grid">
        {entries.map((entry) => (
          <div key={entry.id} className="history-card">
            <div className="history-card__thumb-wrap">
              <img
                className="history-card__thumb"
                src={entry.dataUrl}
                alt={t.thumbAlt(formatTimestamp(entry.timestamp, lang))}
                loading="lazy"
              />
            </div>
            <div className="history-card__footer">
              <span className="history-card__time">{formatTimestamp(entry.timestamp, lang)}</span>
              <div className="history-card__actions">
                <button
                  type="button"
                  className="history-card__btn"
                  onClick={(): void => handleCopy(entry)}
                  title={t.copyTitle}
                >
                  {copying === entry.id ? '✓' : t.copy}
                </button>
                <button
                  type="button"
                  className="history-card__btn"
                  onClick={(): void => handlePin(entry)}
                  title={t.pinTitle}
                >
                  {t.pin}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
