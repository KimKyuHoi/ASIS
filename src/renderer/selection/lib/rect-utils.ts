import type { CSSProperties } from 'react';
import type { Point, Rect } from '../types/selection';

/** 포인터 이벤트의 오버레이 로컬 좌표(CSS px). */
export function clientPoint(e: MouseEvent): Point {
  return { x: e.clientX, y: e.clientY };
}

export function normalize(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/** 가로·세로 중 하나라도 min 보다 작으면 클릭(손 떨림)으로 본다. */
export function isSmallerThan(rect: Rect, min: number): boolean {
  return rect.w < min || rect.h < min;
}

const CHIP_GAP = 8;
const CHIP_HEIGHT = 28;
const CHIP_WIDTH_ESTIMATE = 220;

export function chipPlacement(rect: Rect): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 기본은 사각형 아래. 화면 밖이면 위, 위도 없으면 사각형 안쪽 하단.
  const below = rect.y + rect.h + CHIP_GAP;
  const above = rect.y - CHIP_HEIGHT - CHIP_GAP;
  const insideBottom = rect.y + rect.h - CHIP_HEIGHT - CHIP_GAP;
  let top = below;
  if (below + CHIP_HEIGHT > vh) top = above > 0 ? above : insideBottom;

  // 사각형 오른쪽 끝에 맞추되 화면 좌우 가장자리 안으로 clamp.
  const rightAligned = rect.x + rect.w - CHIP_WIDTH_ESTIMATE;
  const left = Math.max(CHIP_GAP, Math.min(rightAligned, vw - CHIP_WIDTH_ESTIMATE - CHIP_GAP));

  return { transform: `translate(${left}px, ${top}px)` };
}

function containsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

/**
 * point 를 포함하는 윈도우 중 *가장 작은* 것 — 겹쳐 있으면 가장 specific 한 게
 * 사용자가 의도한 윈도우다 (Snipaste 결). 없으면 null.
 */
export function findSmallestWindowAt<T extends Rect>(
  windows: readonly T[],
  point: Point,
): T | null {
  let smallest: T | null = null;
  for (const w of windows) {
    if (!containsPoint(w, point)) continue;
    if (!smallest || w.w * w.h < smallest.w * smallest.h) smallest = w;
  }
  return smallest;
}
