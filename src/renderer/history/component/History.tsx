import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { formatTime } from '../lib/format-time';

type HistoryEntry = {
  id: string;
  dataUrl: string;
  timestamp: number;
  width: number;
  height: number;
};

export default function History(): JSX.Element {
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
        <p className="history__empty-text">아직 캡처 기록이 없습니다.</p>
        <p className="history__empty-hint">캡처 후 복사 또는 핀을 누르면 여기에 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="history">
      <h1 className="history__title">캡처 히스토리 ({entries.length})</h1>
      <div className="history__grid">
        {entries.map((entry) => (
          <div key={entry.id} className="history-card">
            <div className="history-card__thumb-wrap">
              <img
                className="history-card__thumb"
                src={entry.dataUrl}
                alt={`캡처 ${formatTime(entry.timestamp)}`}
                loading="lazy"
              />
            </div>
            <div className="history-card__footer">
              <span className="history-card__time">{formatTime(entry.timestamp)}</span>
              <div className="history-card__actions">
                <button
                  type="button"
                  className="history-card__btn"
                  onClick={(): void => handleCopy(entry)}
                  title="클립보드 복사"
                >
                  {copying === entry.id ? '✓' : '복사'}
                </button>
                <button
                  type="button"
                  className="history-card__btn"
                  onClick={(): void => handlePin(entry)}
                  title="핀으로 띄우기"
                >
                  핀
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
