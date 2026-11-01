import { useRef, useState } from 'react';
import type { HoverElement, Point } from '../types/selection';

/** AX 쿼리 throttle — 이 간격마다 한 번만 IPC 를 보낸다. */
const ELEMENT_QUERY_INTERVAL_MS = 50;

/**
 * 커서 아래 AX 요소. queryAt 은 이벤트 핸들러에서 호출한다 (throttle 포함).
 * 조회 실패는 "요소 없음" 으로 처리한다.
 */
export function useHoverElement(): {
  hoverElement: HoverElement | null;
  queryAt: (point: Point) => void;
} {
  const [hoverElement, setHoverElement] = useState<HoverElement | null>(null);
  const lastQueryAtRef = useRef(0);

  const queryAt = (point: Point): void => {
    const now = Date.now();
    if (now - lastQueryAtRef.current < ELEMENT_QUERY_INTERVAL_MS) return;
    lastQueryAtRef.current = now;
    window.selection.elementAt(point.x, point.y).then(setHoverElement).catch(() => {
      setHoverElement(null);
    });
  };

  return { hoverElement, queryAt };
}
