import { useEffect, useRef, useState } from 'react';
import type { HistoryEntry } from '../types/history-entry';

/** 복사 완료 ✓ 표시를 유지하는 시간(ms). */
const COPIED_FEEDBACK_MS = 800;

/**
 * 히스토리 항목 복사 + 잠깐 보이는 ✓ 표시.
 * 새로 복사하면 이전 타이머를 취소해, A 의 타이머가 B 의 ✓ 를 일찍 지우지 않게 한다.
 */
export function useCopyFeedback(): {
  copying: string | null;
  copy: (entry: HistoryEntry) => void;
} {
  const [copying, setCopying] = useState<string | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 복사 순번 — 늦게 끝난 이전 복사가 새 복사의 타이머를 지우지 않게 한다. */
  const copySeq = useRef(0);

  const clearFeedbackTimer = (): void => {
    if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = null;
  };

  // 언마운트 시 남은 타이머 정리.
  useEffect(() => clearFeedbackTimer, []);

  const copy = (entry: HistoryEntry): void => {
    clearFeedbackTimer();
    copySeq.current += 1;
    const seq = copySeq.current;
    setCopying(entry.id);
    // 이 항목이 아직 ✓ 상태일 때만 지운다 — A 의 복사가 B 클릭 뒤에 끝나도 B 를 건드리지 않는다.
    const clearIfMine = (): void => {
      setCopying((current) => (current === entry.id ? null : current));
    };
    window.captureHistory.copy(entry.dataUrl).then(() => {
      // 그 사이 다른 항목을 복사했다면 그쪽 타이머가 주인이다.
      if (seq !== copySeq.current) return;
      clearFeedbackTimer();
      feedbackTimer.current = setTimeout(clearIfMine, COPIED_FEEDBACK_MS);
    }).catch((err: unknown) => {
      console.error('[asis history] copy failed', err);
      clearIfMine();
    });
  };

  return { copying, copy };
}
