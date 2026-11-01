import type { Shape as ShapeData, TextShape } from '../types/shapes';

type Rect = { x: number; y: number; w: number; h: number };

/**
 * 시작점 기준으로 끝점을 45° 단위 각도에 스냅 — Shift 직선/화살표 드로잉용.
 * 길이는 유지하고 방향만 가장 가까운 45° 배수로 돌린다 (수평/수직/대각선).
 */
export function snapAngle45(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: to.x, y: to.y };
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(angle) * len, y: from.y + Math.sin(angle) * len };
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

/** polyline points([x0,y0,x1,y1,...]) 의 bbox. 점이 없으면 null. */
function pointsBBox(points: number[]): Rect | null {
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  if (xs.length === 0) return null;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** 텍스트 bbox 근사 — 글자 폭 0.6em, 줄 높이 1.2em. 빈 텍스트는 공백 한 줄로 본다. */
function textBBox(shape: TextShape): Rect {
  const lines = (shape.text === '' ? ' ' : shape.text).split('\n');
  const longest = Math.max(...lines.map((l) => l.length));
  return {
    x: shape.x,
    y: shape.y,
    w: Math.max(40, longest * shape.fontSize * 0.6),
    h: lines.length * shape.fontSize * 1.2,
  };
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
    case 'pen':
      return pointsBBox(shape.points);
    case 'text':
      return textBBox(shape);
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
