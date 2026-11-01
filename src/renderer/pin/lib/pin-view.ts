import type { PinView, PinViewAction } from '../types/pin-view';

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const OPACITY_MIN = 0.15;
const OPACITY_MAX = 1;

export const INITIAL_PIN_VIEW: PinView = {
  zoom: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function pinViewReducer(view: PinView, action: PinViewAction): PinView {
  switch (action.type) {
    case 'rotate':
      return { ...view, rotation: view.rotation + action.delta };
    case 'flip-x':
      return { ...view, flipX: !view.flipX };
    case 'flip-y':
      return { ...view, flipY: !view.flipY };
    case 'zoom-by':
      return { ...view, zoom: clamp(view.zoom * action.factor, ZOOM_MIN, ZOOM_MAX) };
    case 'opacity-by':
      return { ...view, opacity: clamp(view.opacity + action.delta, OPACITY_MIN, OPACITY_MAX) };
    case 'set-opacity':
      return { ...view, opacity: clamp(action.opacity, OPACITY_MIN, OPACITY_MAX) };
    case 'reset':
      return INITIAL_PIN_VIEW;
    default: {
      // 새 액션을 추가하고 case 를 빠뜨리면 여기서 타입 에러가 난다.
      const unknownAction: never = action;
      throw new Error(`unknown pin view action: ${JSON.stringify(unknownAction)}`);
    }
  }
}

/** 1/2 회전, 3/4 뒤집기, +/- 줌, 0 초기화. 매핑에 없는 키는 null. */
const KEY_ACTIONS: Record<string, PinViewAction> = {
  '1': { type: 'rotate', delta: -90 },
  '2': { type: 'rotate', delta: 90 },
  '3': { type: 'flip-x' },
  '4': { type: 'flip-y' },
  '+': { type: 'zoom-by', factor: 1.1 },
  '=': { type: 'zoom-by', factor: 1.1 },
  '-': { type: 'zoom-by', factor: 1 / 1.1 },
  '_': { type: 'zoom-by', factor: 1 / 1.1 },
  '0': { type: 'reset' },
};

export function viewActionForKey(key: string): PinViewAction | null {
  return Object.hasOwn(KEY_ACTIONS, key) ? KEY_ACTIONS[key] : null;
}

/** 회전 후 윈도우가 담아야 할 크기 — 90/270도면 가로세로가 바뀐다. */
export function contentSize(
  image: { width: number; height: number },
  view: Pick<PinView, 'zoom' | 'rotation'>,
): { width: number; height: number } {
  const isSwapped = Math.abs(view.rotation % 180) === 90;
  const width = isSwapped ? image.height : image.width;
  const height = isSwapped ? image.width : image.height;
  return { width: Math.round(width * view.zoom), height: Math.round(height * view.zoom) };
}

export function imageTransform(view: PinView): string {
  return `rotate(${view.rotation}deg) scale(${view.flipX ? -1 : 1}, ${view.flipY ? -1 : 1})`;
}
