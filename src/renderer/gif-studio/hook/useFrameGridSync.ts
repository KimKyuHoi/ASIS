import { useEffect } from 'react';
import { setGrid } from '../lib/frame-docs';
import { makeGrid } from '../lib/frame-grid';

/** 트림·FPS·속도가 바뀌면 프레임 격자를 다시 만든다 (주석은 원본 시각을 따라 유지). */
export function useFrameGridSync(
  trim: { start: number; end: number },
  fps: number,
  speed: number,
): void {
  const { start, end } = trim;
  useEffect(() => {
    setGrid(makeGrid({ start, end }, fps, speed));
  }, [start, end, fps, speed]);
}
