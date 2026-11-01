import { useEffect, useState } from 'react';

/** 작은 GIF 도 주석을 그리기 편하도록 원본의 2배까지는 키워 보여 준다. */
const MAX_SCALE = 2;

/**
 * container 안에 width×height 를 담을 수 있는 최대 배율.
 * container 크기는 창 리사이즈·패널 레이아웃에 따라 바뀌므로 ResizeObserver 로 따라간다
 * (DOM 요소와의 동기화 — editor 의 useEditorImages resize 리스너와 같은 성격).
 */
export function useFitScale(
  container: HTMLElement | null,
  width: number,
  height: number,
): number {
  const [scale, setScale] = useState(0);

  useEffect(() => {
    if (!container) return undefined;
    const recompute = (): void => {
      const next = Math.min(
        container.clientWidth / width,
        container.clientHeight / height,
        MAX_SCALE,
      );
      setScale(Math.max(0, next));
    };
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [container, width, height]);

  return scale;
}
