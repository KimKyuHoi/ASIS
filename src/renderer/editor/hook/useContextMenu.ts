import { useEffect, useState } from 'react';

export type ContextMenuState = { x: number; y: number; shapeId: string };

/** 도형 우클릭 메뉴 상태 — 외부 mousedown 시 닫힌다. */
export function useContextMenu(): [
  ContextMenuState | null,
  (menu: ContextMenuState | null) => void,
] {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (): void => setMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);
  return [menu, setMenu];
}
