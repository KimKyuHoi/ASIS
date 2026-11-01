import type { Rect, RulerAction, RulerState } from '../types/selection';
import { isSmallerThan, normalize } from './rect-utils';

export const INITIAL_RULER_STATE: RulerState = { kind: 'idle' };
/** 손 떨림 방지 임계값(px) — 측정은 캡처보다 살짝 관대하다. */
const MIN_MEASURE_SIZE = 4;

export function reduceRuler(state: RulerState, action: RulerAction): RulerState {
  switch (action.type) {
    case 'pointer-down':
      // 새 드래그는 언제나 새 측정으로 교체(measured 상태여도 다시 그릴 수 있음).
      return { kind: 'dragging', start: action.point, current: action.point };
    case 'pointer-move':
      if (state.kind !== 'dragging') return state;
      return { ...state, current: action.point };
    case 'pointer-up': {
      if (state.kind !== 'dragging') return state;
      const rect = normalize(state.start, state.current);
      // 너무 작은 영역은 클릭으로 보고 측정을 확정하지 않는다 — idle 로 복귀.
      return isSmallerThan(rect, MIN_MEASURE_SIZE) ? { kind: 'idle' } : { kind: 'measured', rect };
    }
    case 'clear':
      return { kind: 'idle' };
    default: {
      // 새 action type 추가 시 컴파일 에러로 알린다.
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** 화면에 그릴 측정 사각형 — idle 이면 없다. */
export function measureRectOf(state: RulerState): Rect | null {
  switch (state.kind) {
    case 'dragging':
      return normalize(state.start, state.current);
    case 'measured':
      return state.rect;
    case 'idle':
      return null;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
