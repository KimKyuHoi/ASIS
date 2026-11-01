import { useEffect, useEffectEvent } from 'react';

type PointerListeners = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
};

/**
 * 오버레이의 pointer / keyboard listener 를 window 에 한 번만 붙인다.
 *
 * element 가 아닌 window 에 붙이는 이유: 마우스가 잠시 윈도우 밖으로 나갔다가
 * 돌아와도 박스 상태가 유지되어야 한다. 핸들러는 Effect Event 로 감싸 최신
 * state 를 읽으므로, state 가 바뀔 때마다 리스너를 다시 붙이지 않는다 —
 * 재등록하면 pointerdown → pointerup 사이 teardown 레이스로 pointerup 이 누락된다.
 * 기본 컨텍스트 메뉴는 항상 막는다 (우클릭은 오버레이가 직접 처리).
 */
export function useWindowPointerListeners(listeners: PointerListeners): void {
  const onPointerDown = useEffectEvent((e: PointerEvent) => listeners.onPointerDown(e));
  const onPointerMove = useEffectEvent((e: PointerEvent) => listeners.onPointerMove(e));
  const onPointerUp = useEffectEvent((e: PointerEvent) => listeners.onPointerUp(e));
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => listeners.onKeyDown(e));

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent): void => onPointerDown(e);
    const handlePointerMove = (e: PointerEvent): void => onPointerMove(e);
    const handlePointerUp = (e: PointerEvent): void => onPointerUp(e);
    const handleKeyDown = (e: KeyboardEvent): void => onKeyDown(e);
    const preventContextMenu = (e: MouseEvent): void => e.preventDefault();

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('contextmenu', preventContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('contextmenu', preventContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
