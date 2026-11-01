import type { JSX } from 'react';
import {
  Arrow as KArrow,
  Ellipse as KEllipse,
  Line as KLine,
  Rect as KRect,
} from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../../lib/store';
import {
  clampXY,
  commitBoxDrag,
  commitBoxTransform,
  transformPoints,
} from '../../lib/shape-transform';
import {
  commitPointsDrag,
  isMultiDrag,
  type NodeCommon,
  type StrokedShape,
} from '../../lib/shape-node';
import { useZoomComp, type DashProps } from '../../hook/useZoomComp';
import type {
  ArrowShape,
  EllipseShape,
  LineShape,
  PenShape,
  RectShape,
} from '../../types/shapes';

// stroke 가 얇아도 hit 잡기 쉽도록 — 이거 없으면 marquee 후 drag 시
// 사용자가 선을 정확히 안 누르면 hit 안 받아 그룹 drag 실패.
const hitWidth = (strokeWidth: number): number => Math.max(20, strokeWidth + 16);

/** 줌 보정 stroke 공통 props — name="zoom-comp" 노드는 export 때 원본 두께로 복원된다. */
type StrokeProps = DashProps & {
  id: string;
  rotation: number;
  stroke: string;
  strokeWidth: number;
  name: string;
  baseStrokeWidth: number;
};

function useStrokeProps(shape: StrokedShape): StrokeProps {
  const { vw, dashProps } = useZoomComp();
  return {
    id: shape.id,
    rotation: shape.rotation ?? 0,
    stroke: shape.stroke,
    strokeWidth: vw(shape.strokeWidth),
    name: 'zoom-comp',
    baseStrokeWidth: shape.strokeWidth,
    ...dashProps(shape),
  };
}

function RectNode({ shape, ...common }: NodeCommon & { shape: RectShape }): JSX.Element {
  const stroke = useStrokeProps(shape);
  const updateShape = useEditorStore((s) => s.updateShape);
  return (
    <KRect
      {...stroke}
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      // 시각상 투명 fill — 박스 안쪽 클릭으로도 hit 받아 drag 시작 가능 (PPT/Figma 결).
      fill="rgba(0,0,0,0.001)"
      draggable={common.draggable}
      onClick={common.onSelect}
      onTap={common.onSelect}
      onContextMenu={common.onContextMenu}
      onDragEnd={(e): void => {
        if (isMultiDrag()) return;
        updateShape(shape.id, commitBoxDrag(e.target, shape.w, shape.h));
      }}
      onTransformEnd={(e): void => {
        const box = commitBoxTransform(e.target, { w: shape.w, h: shape.h }, 5);
        updateShape(shape.id, { ...box, rotation: e.target.rotation() });
      }}
    />
  );
}

function commitEllipseTransform(shape: EllipseShape, node: Konva.Node): Partial<EllipseShape> {
  const sx = node.scaleX();
  const sy = node.scaleY();
  node.scaleX(1);
  node.scaleY(1);
  const { x: cx, y: cy } = clampXY(
    node.position(),
    { w: Math.abs(shape.rx) * sx * 2, h: Math.abs(shape.ry) * sy * 2 },
  );
  return {
    cx,
    cy,
    rx: Math.max(3, Math.abs(shape.rx) * sx),
    ry: Math.max(3, Math.abs(shape.ry) * sy),
    rotation: node.rotation(),
  };
}

function EllipseNode({ shape, ...common }: NodeCommon & { shape: EllipseShape }): JSX.Element {
  const stroke = useStrokeProps(shape);
  const updateShape = useEditorStore((s) => s.updateShape);
  return (
    <KEllipse
      {...stroke}
      x={shape.cx}
      y={shape.cy}
      radiusX={Math.abs(shape.rx)}
      radiusY={Math.abs(shape.ry)}
      fill="rgba(0,0,0,0.001)"
      draggable={common.draggable}
      onClick={common.onSelect}
      onTap={common.onSelect}
      onContextMenu={common.onContextMenu}
      onDragEnd={(e): void => {
        if (isMultiDrag()) return;
        const { x: cx, y: cy } = clampXY(
          e.target.position(),
          { w: Math.abs(shape.rx) * 2, h: Math.abs(shape.ry) * 2 },
        );
        e.target.position({ x: cx, y: cy });
        updateShape(shape.id, { cx, cy });
      }}
      onTransformEnd={(e): void => {
        updateShape(shape.id, commitEllipseTransform(shape, e.target));
      }}
    />
  );
}

/**
 * arrow — Transformer 가 붙지 않는다, 끝점 핸들(EndpointHandles)로 조작.
 * 따라서 onTransformEnd 불필요 (박스 스케일 음수화로 좌표가 날뛰던 원인 제거).
 */
function ArrowNode({ shape, ...common }: NodeCommon & { shape: ArrowShape }): JSX.Element {
  const stroke = useStrokeProps(shape);
  const { vw } = useZoomComp();
  const pointer = Math.max(8, shape.strokeWidth * 3);
  return (
    <KArrow
      {...stroke}
      points={shape.points}
      fill={shape.stroke}
      pointerLength={vw(pointer)}
      pointerWidth={vw(pointer)}
      basePointer={pointer}
      hitStrokeWidth={vw(hitWidth(shape.strokeWidth))}
      draggable={common.draggable}
      onClick={common.onSelect}
      onTap={common.onSelect}
      onContextMenu={common.onContextMenu}
      onDragEnd={(e): void => commitPointsDrag(shape.id, shape.points, e.target)}
    />
  );
}

/** pen transform — scale·offset 을 points 에 굽고 node 를 원점·scale 1 로 되돌린다. */
function commitPenTransform(shape: PenShape, node: Konva.Node): Partial<PenShape> {
  const scale = { x: node.scaleX(), y: node.scaleY() };
  const offset = node.position();
  node.scaleX(1);
  node.scaleY(1);
  node.position({ x: 0, y: 0 });
  return { points: transformPoints(shape.points, scale, offset), rotation: node.rotation() };
}

/**
 * line / pen — 같은 KLine. pen 만 곡선(tension)과 Transformer 변환을 가진다.
 * line 은 Transformer 가 붙지 않는다 — 끝점 핸들(EndpointHandles)로 조작.
 */
function PolylineNode({
  shape,
  ...common
}: NodeCommon & { shape: LineShape | PenShape }): JSX.Element {
  const stroke = useStrokeProps(shape);
  const { vw } = useZoomComp();
  const updateShape = useEditorStore((s) => s.updateShape);
  const isPen = shape.kind === 'pen';
  return (
    <KLine
      {...stroke}
      points={shape.points}
      tension={isPen ? 0.4 : undefined}
      lineCap="round"
      lineJoin="round"
      hitStrokeWidth={vw(hitWidth(shape.strokeWidth))}
      draggable={common.draggable}
      onClick={common.onSelect}
      onTap={common.onSelect}
      onContextMenu={common.onContextMenu}
      onDragEnd={(e): void => commitPointsDrag(shape.id, shape.points, e.target)}
      onTransformEnd={isPen
        ? (e): void => updateShape(shape.id, commitPenTransform(shape, e.target))
        : undefined}
    />
  );
}

/** stroke 기반 도형(rect/ellipse/arrow/line/pen) 렌더. */
export function StrokedShapeNode({
  shape,
  ...common
}: NodeCommon & { shape: StrokedShape }): JSX.Element {
  switch (shape.kind) {
    case 'rect':
      return <RectNode shape={shape} {...common} />;
    case 'ellipse':
      return <EllipseNode shape={shape} {...common} />;
    case 'arrow':
      return <ArrowNode shape={shape} {...common} />;
    case 'line':
    case 'pen':
      return <PolylineNode shape={shape} {...common} />;
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}
