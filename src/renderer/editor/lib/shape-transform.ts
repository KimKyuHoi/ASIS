import type Konva from 'konva';
import { useEditorStore } from './store';
import type { Shape } from '../types/shapes';

/**
 * 도형 drag/transform 종료 시 공통 좌표 계산 헬퍼.
 *
 * Shape/index.tsx 의 각 case 핸들러가 반복하던 clamp/scale-reset 로직을 모았다.
 * 동작은 추출 이전과 1:1 동일 — 박스형은 node mutation(position/scale reset)을
 * 포함하고, points형은 순수 계산만 하고 mutation 은 호출처에 남긴다 (updateShape →
 * position reset 의 실행 순서를 보존하기 위함).
 *
 * 룰: imperative-style.md — util 모듈 명령형 OK. iw/ih 는 store getState 로 읽는다
 * (추출 이전 clampXY 와 동일).
 */

/** 이미지 경계 안으로 (x,y) clamp. w/h = 도형 폭/높이(우/하단 경계 계산용). */
export function clampXY(
  x: number,
  y: number,
  w = 0,
  h = 0,
): { x: number; y: number } {
  const { imageWidth: iw, imageHeight: ih } = useEditorStore.getState();
  return {
    x: Math.max(0, Math.min(x, iw - w)),
    y: Math.max(0, Math.min(y, ih - h)),
  };
}

/** point 배열([x0,y0,x1,y1,...])의 bounding box를 이미지 안으로 clamp 하는 delta 반환. */
export function clampPointsDelta(
  points: number[],
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const { imageWidth: iw, imageHeight: ih } = useEditorStore.getState();
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return {
    dx: Math.max(-minX, Math.min(dx, iw - maxX)),
    dy: Math.max(-minY, Math.min(dy, ih - maxY)),
  };
}

/**
 * 박스형 도형(rect/highlight/blur/mosaic/image)의 drag 종료 처리.
 * node 위치를 경계 안으로 clamp 하여 *적용*하고, 커밋할 {x,y} 를 반환.
 */
export function commitBoxDrag(
  node: Konva.Node,
  w: number,
  h: number,
): { x: number; y: number } {
  const { x, y } = clampXY(node.x(), node.y(), w, h);
  node.position({ x, y });
  return { x, y };
}

/**
 * 박스형 도형의 transform 종료 처리 — scale 을 1 로 reset 하고 새 위치·크기 반환.
 * rotation 커밋 여부는 호출처가 결정한다(highlight 는 rotation 미커밋).
 * @param minSize 최소 폭/높이 (rect/highlight=5, blur/mosaic/image=10)
 */
export function commitBoxTransform(
  node: Konva.Node,
  w: number,
  h: number,
  minSize: number,
): { x: number; y: number; w: number; h: number } {
  const sx = node.scaleX();
  const sy = node.scaleY();
  node.scaleX(1);
  node.scaleY(1);
  const { x, y } = clampXY(node.x(), node.y(), w * sx, h * sy);
  return { x, y, w: Math.max(minSize, w * sx), h: Math.max(minSize, h * sy) };
}

/** points형(arrow/line/pen) drag — (dx,dy) 만큼 이동하되 경계 안으로 clamp 한 새 points. */
export function shiftPointsClamped(
  points: number[],
  dx: number,
  dy: number,
): number[] {
  const { dx: cdx, dy: cdy } = clampPointsDelta(points, dx, dy);
  return points.map((v, i) => (i % 2 === 0 ? v + cdx : v + cdy));
}

/** points형 transform — 각 점에 scale + offset 적용한 새 points. */
export function transformPoints(
  points: number[],
  sx: number,
  sy: number,
  dx: number,
  dy: number,
): number[] {
  return points.map((v, i) => (i % 2 === 0 ? v * sx + dx : v * sy + dy));
}

/**
 * 도형을 (dx,dy) 만큼 이동한 부분 패치 반환 — 다중 선택 드래그(leader/group)에서
 * 선택 도형 전부에 같은 delta 를 적용할 때 공유한다. 좌표계가 종류별로 달라
 * (박스 x/y, ellipse cx/cy, polyline points) 분기한다. updateShape(id, patch) 로 커밋.
 *
 * @param anchor 박스/ellipse 의 *드래그 시작 시점 좌표*(dragstart 때 캡처한 node 위치).
 *   기존 호출부의 `startPos + delta` 와 1:1 동일 — "드래그 중 store 좌표 불변" 가정에
 *   의존하지 않도록 앵커를 명시적으로 받는다. polyline(arrow/line/pen)은 node 위치가
 *   항상 (0,0) 이라 anchor 를 쓰지 않고 shape.points 자체에 delta 를 더한다.
 */
export function shapeDeltaPatch(
  shape: Shape,
  dx: number,
  dy: number,
  anchor: { x: number; y: number },
): Partial<Shape> {
  switch (shape.kind) {
    case 'rect':
    case 'highlight':
    case 'blur':
    case 'mosaic':
    case 'image':
    case 'text':
    case 'step':
      return { x: anchor.x + dx, y: anchor.y + dy };
    case 'ellipse':
      return { cx: anchor.x + dx, cy: anchor.y + dy };
    case 'arrow':
    case 'line':
    case 'pen':
      return { points: shape.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}
