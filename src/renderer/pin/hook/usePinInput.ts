import { useEffect } from 'react';
import type { PinViewAction } from '../types/pin-view';
import { viewActionForKey } from '../lib/pin-view';

/**
 * 핀 키보드·휠 입력.
 *   ESC / ⌘W : 닫기      X : click-through 토글
 *   1/2 회전, 3/4 뒤집기, +/- 줌, 0 초기화
 *   휠 = 줌, ⌘/Ctrl+휠 = 투명도
 */
export function usePinInput(
  dispatch: (action: PinViewAction) => void,
  toggleLock: () => void,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape' || (isMeta && e.code === 'KeyW')) {
        e.preventDefault();
        window.pin.close();
        return;
      }
      // ⌘X 는 잘라내기 관례라 토글하지 않는다. 키를 누르고 있을 때의 자동 반복도 무시.
      if (e.code === 'KeyX' && !isMeta) {
        if (!e.repeat) toggleLock();
        return;
      }
      const action = viewActionForKey(e.key);
      if (action) dispatch(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, toggleLock]);

  useEffect(() => {
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // 투명도 — deltaY > 0 → 더 투명, < 0 → 더 진하게.
        dispatch({ type: 'opacity-by', delta: e.deltaY > 0 ? -0.05 : 0.05 });
      } else {
        dispatch({ type: 'zoom-by', factor: e.deltaY > 0 ? 1 / 1.1 : 1.1 });
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [dispatch]);
}
