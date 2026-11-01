import type Konva from 'konva';
import { useEditorStore } from './store';
import { shiftPointsClamped } from './shape-transform';
import type {
  ArrowShape,
  EllipseShape,
  LineShape,
  PenShape,
  RectShape,
  Shape,
} from '../types/shapes';

/** 모든 도형 노드 컴포넌트가 공유하는 상호작용 props. */
export type NodeCommon = {
  /** 선택된 도형만 드래그 가능. */
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void;
};

/** 다중 선택 드래그 중이면 개별 dragend 커밋을 건너뛴다 (useEditorDrag 가 일괄 처리). */
export function isMultiDrag(): boolean {
  return useEditorStore.getState().selectedIds.length > 1;
}

/**
 * polyline(arrow/line/pen) dragend — node 이동량을 points 에 반영(경계 clamp)하고
 * node 위치는 (0,0) 으로 되돌린다 (polyline 은 points 가 좌표의 원천).
 */
export function commitPointsDrag(id: string, points: number[], node: Konva.Node): void {
  if (isMultiDrag()) return;
  useEditorStore.getState().updateShape(id, {
    points: shiftPointsClamped(points, node.x(), node.y()),
  });
  node.position({ x: 0, y: 0 });
}

/** stroke 기반 도형 — 줌 보정 두께(zoom-comp)·점선을 갖는다. */
export type StrokedShape = RectShape | EllipseShape | ArrowShape | LineShape | PenShape;

export function isStrokedShape(shape: Shape): shape is StrokedShape {
  return shape.kind === 'rect' || shape.kind === 'ellipse' || shape.kind === 'arrow' ||
    shape.kind === 'line' || shape.kind === 'pen';
}
