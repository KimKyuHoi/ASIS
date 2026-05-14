import type { CSSProperties } from 'react';
import type { Point, Rect } from '../types/selection';

export function normalize(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

const CHIP_GAP = 8;
const CHIP_HEIGHT = 28;
const CHIP_WIDTH_ESTIMATE = 220;

export function chipPlacement(rect: Rect): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.x + rect.w - CHIP_WIDTH_ESTIMATE;
  let top = rect.y + rect.h + CHIP_GAP;

  if (top + CHIP_HEIGHT > vh) {
    if (rect.y - CHIP_HEIGHT - CHIP_GAP > 0) {
      top = rect.y - CHIP_HEIGHT - CHIP_GAP;
    } else {
      top = rect.y + rect.h - CHIP_HEIGHT - CHIP_GAP;
    }
  }
  left = Math.max(CHIP_GAP, Math.min(left, vw - CHIP_WIDTH_ESTIMATE - CHIP_GAP));

  return { transform: `translate(${left}px, ${top}px)` };
}
