import { useEffect, useState } from 'react';
import type { HistoryEntry } from '../types/history-entry';

/**
 * 히스토리 목록 — 창을 열 때와 창에 다시 포커스가 올 때 main 에서 새로 받는다.
 * 창을 연 채로 캡처를 계속하면 오래된 항목의 편집본이 떨어져 나가므로(main/captureHistory 상한)
 * 한 번만 받으면 [편집] 표시가 실제와 어긋난다.
 * focus 는 창 수명 동안의 window 이벤트 — 컴포넌트 teardown 에서 떼어 낸다.
 */
export function useHistoryEntries(): { entries: HistoryEntry[]; reload: () => void } {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const reload = (): void => {
    window.captureHistory.list().then(setEntries).catch((err: unknown) => {
      console.error('[asis history] list failed', err);
    });
  };

  useEffect(() => {
    const load = (): void => {
      window.captureHistory.list().then(setEntries).catch((err: unknown) => {
        console.error('[asis history] list failed', err);
      });
    };
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  return { entries, reload };
}
