import { useEffect, useRef, type Dispatch } from 'react';
import type { DragAction, DragState, HoverElement, Point, Rect, SnapWindow } from '../types/selection';
import { clientPoint, findSmallestWindowAt } from '../lib/rect-utils';
import { MIN_RECT_SIZE } from '../lib/selection-reducer';
import { cancelOverlay, captureRect } from '../lib/selection-ipc';
import { useWindowPointerListeners } from './useWindowPointerListeners';

/** committed 전이 후 IPC 전송까지 대기 — styles.css 의 selectionCommit 키프레임과 일치. */
const COMMIT_PULSE_MS = 90;

const MOUSE_BUTTON_PRIMARY = 0;
const MOUSE_BUTTON_SECONDARY = 2;

type PendingClick = { start: Point; target: Rect | null };

type Params = {
  state: DragState;
  dispatch: Dispatch<DragAction>;
  windows: SnapWindow[];
  hoverElement: HoverElement | null;
  onHover: (point: Point) => void;
  onSecondaryClick: (point: Point) => void;
};

/**
 * 클릭 한 번으로 잡을 영역 — window hit 우선, 없으면 AX element
 * (element 좌표가 부정확할 때 전체화면 캡처되는 것을 막는다). Shift 면 snap 없이 드래그만.
 */
function clickTargetAt(params: Params, point: Point, shiftKey: boolean): Rect | null {
  if (shiftKey) return null;
  const windowHit = findSmallestWindowAt(params.windows, point);
  if (windowHit) return { ...windowHit, windowId: windowHit.id };
  return params.hoverElement;
}

function isClickDistance(from: Point, to: Point): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx * dx + dy * dy < MIN_RECT_SIZE * MIN_RECT_SIZE;
}

/**
 * 영역 선택 오버레이의 포인터·키보드 흐름.
 *   - 좌클릭 드래그 → 사각형 선택, 이동 없는 클릭 → hover 중인 윈도우/요소 캡처
 *   - 우클릭 → onSecondaryClick (색상 복사), ESC → 오버레이 닫기
 *   - committed 로 전이되면 commit 펄스가 끝난 뒤 캡처 IPC 전송
 */
export function useSelectionPointer(params: Params): void {
  const { state, dispatch } = params;
  // pointerdown 시점의 클릭 후보 — 이동 없이 pointerup 되면 그 영역을 캡처한다.
  const pendingClickRef = useRef<PendingClick | null>(null);

  useWindowPointerListeners({
    onPointerDown: (e) => {
      const point = clientPoint(e);
      if (e.button === MOUSE_BUTTON_SECONDARY) {
        params.onSecondaryClick(point);
        return;
      }
      if (e.button !== MOUSE_BUTTON_PRIMARY) return;
      pendingClickRef.current = { start: point, target: clickTargetAt(params, point, e.shiftKey) };
      dispatch({ type: 'pointer-down', point });
    },
    onPointerMove: (e) => {
      const point = clientPoint(e);
      dispatch({ type: 'pointer-move', point });
      params.onHover(point);
    },
    onPointerUp: (e) => {
      const pending = pendingClickRef.current;
      pendingClickRef.current = null;
      dispatch({ type: 'pointer-up' });
      if (!pending?.target) return;
      if (isClickDistance(pending.start, clientPoint(e))) captureRect(pending.target);
    },
    onKeyDown: (e) => {
      if (e.key === 'Escape') cancelOverlay();
    },
  });

  useEffect(() => {
    if (state.kind !== 'committed') return undefined;
    const rect = state.rect;
    const handle = window.setTimeout(() => captureRect(rect), COMMIT_PULSE_MS);
    return () => window.clearTimeout(handle);
  }, [state]);
}
