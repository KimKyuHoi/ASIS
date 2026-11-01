import { snapAngle45 } from './geometry';
import type {
  BlurShape,
  DashStyle,
  HighlightShape,
  MosaicShape,
  RectShape,
  Shape,
  Tool,
} from '../types/shapes';

type Point = { x: number; y: number };

/** 드래그로 크기를 정하는 도구 — pointerdown 에서 0 크기로 시작해 move 로 늘린다. */
export type DragTool = 'rect' | 'ellipse' | 'arrow' | 'line' | 'pen' | 'highlight' | 'blur' | 'mosaic';

/** 새 도형의 스타일 기본값 — 스토어의 현재 도구 설정. */
export type DrawStyle = {
  color: string;
  strokeWidth: number;
  dash: DashStyle;
  blurRadius: number;
  mosaicBlockSize: number;
};

type Origin = Point & { id: string };

const DRAG_FACTORIES: Record<DragTool, (o: Origin, st: DrawStyle) => Shape> = {
  rect: (o, st) => ({
    kind: 'rect', id: o.id, x: o.x, y: o.y, w: 0, h: 0,
    stroke: st.color, strokeWidth: st.strokeWidth, dash: st.dash,
  }),
  ellipse: (o, st) => ({
    kind: 'ellipse', id: o.id, cx: o.x, cy: o.y, rx: 0, ry: 0,
    stroke: st.color, strokeWidth: st.strokeWidth, dash: st.dash,
  }),
  arrow: (o, st) => ({
    kind: 'arrow', id: o.id, points: [o.x, o.y, o.x, o.y],
    stroke: st.color, strokeWidth: st.strokeWidth, dash: st.dash,
  }),
  line: (o, st) => ({
    kind: 'line', id: o.id, points: [o.x, o.y, o.x, o.y],
    stroke: st.color, strokeWidth: st.strokeWidth, dash: st.dash,
  }),
  pen: (o, st) => ({
    kind: 'pen', id: o.id, points: [o.x, o.y],
    stroke: st.color, strokeWidth: st.strokeWidth, dash: st.dash,
  }),
  highlight: (o) => ({
    kind: 'highlight', id: o.id, x: o.x, y: o.y, w: 0, h: 0, fill: 'rgba(255, 235, 59, 0.4)',
  }),
  blur: (o, st) => ({
    kind: 'blur', id: o.id, x: o.x, y: o.y, w: 0, h: 0, blurRadius: st.blurRadius,
  }),
  mosaic: (o, st) => ({
    kind: 'mosaic', id: o.id, x: o.x, y: o.y, w: 0, h: 0, blockSize: st.mosaicBlockSize,
  }),
};

export function isDragTool(tool: Tool): tool is DragTool {
  return Object.hasOwn(DRAG_FACTORIES, tool);
}

export function createDragShape(tool: DragTool, origin: Origin, style: DrawStyle): Shape {
  return DRAG_FACTORIES[tool](origin, style);
}

export function newShapeId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

type BoxShape = RectShape | HighlightShape | BlurShape | MosaicShape;

function isBoxShape(shape: Shape): shape is BoxShape {
  return shape.kind === 'rect' || shape.kind === 'highlight' || shape.kind === 'blur' ||
    shape.kind === 'mosaic';
}

/**
 * 드래그 중 포인터 위치(이미지 좌표)로 그리는 도형을 갱신.
 * snap45 — Shift: 선·화살표 끝점을 45° 단위로 스냅 (수평/수직/대각선 고정).
 */
export function resizeDrawing(shape: Shape, pt: Point, snap45: boolean): Shape {
  if (isBoxShape(shape)) return { ...shape, w: pt.x - shape.x, h: pt.y - shape.y };
  switch (shape.kind) {
    case 'ellipse':
      return { ...shape, rx: pt.x - shape.cx, ry: pt.y - shape.cy };
    case 'arrow':
    case 'line': {
      const [x1, y1] = shape.points;
      const end = snap45 ? snapAngle45({ x: x1, y: y1 }, pt) : pt;
      return { ...shape, points: [x1, y1, end.x, end.y] };
    }
    case 'pen':
      return { ...shape, points: [...shape.points, pt.x, pt.y] };
    default:
      // text/step/image 는 마우스 드래그로 그리지 않음.
      return shape;
  }
}

const MIN_DRAW_PX = 4;

/** 너무 작은 도형(잘못 클릭) 판정 — pointerup 에서 폐기 여부 결정. */
export function isTooSmallDrawing(shape: Shape): boolean {
  if (isBoxShape(shape)) return Math.abs(shape.w) < MIN_DRAW_PX || Math.abs(shape.h) < MIN_DRAW_PX;
  switch (shape.kind) {
    case 'ellipse':
      return Math.abs(shape.rx) < MIN_DRAW_PX || Math.abs(shape.ry) < MIN_DRAW_PX;
    case 'arrow':
    case 'line':
    case 'pen': {
      const pts = shape.points;
      if (pts.length < 4) return true;
      const dx = pts[pts.length - 2] - pts[0];
      const dy = pts[pts.length - 1] - pts[1];
      return dx * dx + dy * dy < MIN_DRAW_PX * MIN_DRAW_PX;
    }
    default:
      // text/step/image 는 클릭 배치라 크기 판정 대상이 아니다.
      return false;
  }
}
