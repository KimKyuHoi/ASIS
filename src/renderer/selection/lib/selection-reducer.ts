import type { DragAction, DragState, Rect } from '../types/selection';
import { isSmallerThan, normalize } from './rect-utils';

export const INITIAL_DRAG_STATE: DragState = { kind: 'idle' };
/** 손 떨림 방지 임계값(px) — 이보다 작은 드래그는 클릭으로 본다. */
export const MIN_RECT_SIZE = 6;

export function reduceDrag(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case 'pointer-down': {
      // 이미 dragging 이면 첫 드래그 유지 (멀티 포인터 무시).
      if (state.kind !== 'idle') return state;
      return { kind: 'dragging', start: action.point, current: action.point };
    }
    case 'pointer-move': {
      if (state.kind !== 'dragging') return state;
      return { ...state, current: action.point };
    }
    case 'pointer-up': {
      if (state.kind !== 'dragging') return state;
      const rect = normalize(state.start, state.current);
      // 너무 작은 영역은 의도하지 않은 클릭이라 idle 로 복귀.
      return isSmallerThan(rect, MIN_RECT_SIZE) ? { kind: 'idle' } : { kind: 'committed', rect };
    }
    default: {
      // 새 action type 이 추가되면 컴파일 에러로 알린다.
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** 화면에 그릴 선택 사각형 — idle 이면 없다. */
export function selectionRectOf(state: DragState): Rect | null {
  switch (state.kind) {
    case 'dragging':
      return normalize(state.start, state.current);
    case 'committed':
      return state.rect;
    case 'idle':
      return null;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
