import type { Shape as ShapeData } from '../types/shapes';

type Rect = { x: number; y: number; w: number; h: number };

/**
 * 시작점 기준으로 끝점을 45° 단위 각도에 스냅 — Shift 직선/화살표 드로잉용.
 * 길이는 유지하고 방향만 가장 가까운 45° 배수로 돌린다 (수평/수직/대각선).
 */
export function snapAngle45(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: x2, y: y2 };
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: x1 + Math.cos(angle) * len, y: y1 + Math.sin(angle) * len };
}

/** Marquee 박스와 도형의 교차 판정 (PPT 식 — 조금만 닿아도 선택). */
export function intersectsMarquee(shape: ShapeData, m: Rect): boolean {
  const bbox = shapeBBox(shape);
  if (!bbox) return false;
  return !(
    bbox.x + bbox.w < m.x ||
    bbox.x > m.x + m.w ||
    bbox.y + bbox.h < m.y ||
    bbox.y > m.y + m.h
  );
}

/** 도형 종류별 axis-aligned bounding box. 회전은 무시 (간이). */
export function shapeBBox(shape: ShapeData): Rect | null {
  switch (shape.kind) {
    case 'rect':
    case 'highlight':
    case 'blur':
    case 'mosaic':
      return {
        x: Math.min(shape.x, shape.x + shape.w),
        y: Math.min(shape.y, shape.y + shape.h),
        w: Math.abs(shape.w),
        h: Math.abs(shape.h),
      };
    case 'ellipse': {
      const rx = Math.abs(shape.rx);
      const ry = Math.abs(shape.ry);
      return { x: shape.cx - rx, y: shape.cy - ry, w: rx * 2, h: ry * 2 };
    }
    case 'arrow':
    case 'line':
    case 'pen': {
      const xs = shape.points.filter((_, i) => i % 2 === 0);
      const ys = shape.points.filter((_, i) => i % 2 === 1);
      if (xs.length === 0) return null;
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return {
        x: minX,
        y: minY,
        w: Math.max(...xs) - minX,
        h: Math.max(...ys) - minY,
      };
    }
    case 'text': {
      const lines = (shape.text || ' ').split('\n');
      const longest = Math.max(...lines.map((l) => l.length));
      return {
        x: shape.x,
        y: shape.y,
        w: Math.max(40, longest * shape.fontSize * 0.6),
        h: lines.length * shape.fontSize * 1.2,
      };
    }
    case 'image':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    case 'step': {
      const r = shape.fontSize * 0.8;
      return { x: shape.x - r, y: shape.y - r, w: r * 2, h: r * 2 };
    }
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}
