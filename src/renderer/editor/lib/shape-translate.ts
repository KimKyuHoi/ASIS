import type { Shape } from '../types/shapes';

/**
 * 도형 전체를 (dx, dy) 만큼 옮긴 새 도형 — 크롭 적용 시 좌표 원점이 크롭 영역 왼쪽 위로
 * 바뀌므로 모든 도형에 같은 이동을 건다. 크기·회전·스타일은 그대로.
 * (shape-transform 의 shapeDeltaPatch 는 드래그 시작 앵커를 받는 부분 패치라 따로 둔다.)
 */
export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.kind) {
    case 'rect':
    case 'highlight':
    case 'blur':
    case 'mosaic':
    case 'image':
    case 'text':
    case 'step':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'ellipse':
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    case 'arrow':
    case 'line':
    case 'pen':
      return { ...shape, points: shape.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}
