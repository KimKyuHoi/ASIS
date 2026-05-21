import { useRef } from 'react';
import type { JSX } from 'react';
import {
  Arrow as KArrow,
  Ellipse as KEllipse,
  Line as KLine,
  Rect as KRect,
  Text as KText,
} from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../../lib/store';
import type { Shape as ShapeData } from '../../types/shapes';
import { BlurShapeNode } from './BlurShapeNode';
import { ImageShapeNode } from './ImageShapeNode';
import { MosaicShapeNode } from './MosaicShapeNode';
import { StepShapeNode } from './StepShapeNode';

/**
 * 단일 도형 렌더 컴포넌트.
 *
 * 룰
 *   - 모든 도형: id 부여 (Transformer 가 stage.findOne(`#${id}`) 로 attach).
 *   - selected 시 draggable + Transformer 핸들 표시 + onTransformEnd 에서 store 갱신
 *     (Konva 표준 패턴: scale 을 적용 후 1로 reset, 새 width/height 를 store 에 반영).
 *   - text 더블클릭 → editingId 설정 → App 이 인라인 textarea 띄움.
 *   - blur 는 bgImage 를 crop + Konva.Filters.Blur + node.cache() 로 *진짜* 가우시안.
 */
export function Shape({
  shape,
  selected,
  bgImage,
  isEditing = false,
  onSelect,
  onContextMenu,
}: {
  shape: ShapeData;
  selected: boolean;
  bgImage: HTMLImageElement | null;
  /** 텍스트 인라인 편집 중일 때 KText 를 숨김. */
  isEditing?: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onContextMenu?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}): JSX.Element | null {
  const updateShape = useEditorStore((s) => s.updateShape);
  const setEditingId = useEditorStore((s) => s.setEditingId);

  // 텍스트 박스 세로 리사이즈 여부 추적 — TransformEnd 에서 height 커밋 여부 결정.
  const textVertResizeRef = useRef(false);

  const draggable = selected;

  const isMultiDrag = (): boolean =>
    useEditorStore.getState().selectedIds.length > 1;

  const handleContextMenu = onContextMenu ?? ((): void => {});

  // 이미지 경계 안으로 좌표를 clamp 하는 헬퍼.
  // 이벤트 핸들러 안에서 getState() 로 꺼내 최신값을 쓴다.
  const clampXY = (x: number, y: number, w = 0, h = 0): { x: number; y: number } => {
    const { imageWidth: iw, imageHeight: ih } = useEditorStore.getState();
    return {
      x: Math.max(0, Math.min(x, iw - w)),
      y: Math.max(0, Math.min(y, ih - h)),
    };
  };

  // point 배열([x0,y0,x1,y1,...])의 bounding box를 이미지 안으로 clamp 하는 delta 반환.
  const clampPointsDelta = (
    points: number[],
    dx: number,
    dy: number,
  ): { dx: number; dy: number } => {
    const { imageWidth: iw, imageHeight: ih } = useEditorStore.getState();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
  };

  // dragBoundFunc 은 폐기 — 도형 종류별 좌표계가 달라(특히 arrow/pen 의 node.position 이 (0,0))
  // 일률적 clamp 가 음수 방향 이동을 막아 막혔다. onDragEnd 에서 post-clamp 처리.

  switch (shape.kind) {
    case 'rect':
      return (
        <KRect
          id={shape.id}
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          rotation={shape.rotation ?? 0}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          // 시각상 투명 fill — 박스 안쪽 클릭으로도 hit 받아 drag 시작 가능 (PPT/Figma 결).
          fill="rgba(0,0,0,0.001)"
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onContextMenu={handleContextMenu}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            const { x, y } = clampXY(e.target.x(), e.target.y(), shape.w, shape.h);
            e.target.position({ x, y });
            updateShape(shape.id, { x, y });
          }}
          onTransformEnd={(e): void => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            const { x, y } = clampXY(node.x(), node.y(), shape.w * sx, shape.h * sy);
            updateShape(shape.id, {
              x,
              y,
              w: Math.max(5, shape.w * sx),
              h: Math.max(5, shape.h * sy),
              rotation: node.rotation(),
            });
          }}
        />
      );

    case 'ellipse':
      return (
        <KEllipse
          id={shape.id}
          x={shape.cx}
          y={shape.cy}
          radiusX={Math.abs(shape.rx)}
          radiusY={Math.abs(shape.ry)}
          rotation={shape.rotation ?? 0}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          fill="rgba(0,0,0,0.001)"
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onContextMenu={handleContextMenu}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            const { x: cx, y: cy } = clampXY(
              e.target.x(), e.target.y(),
              Math.abs(shape.rx) * 2, Math.abs(shape.ry) * 2,
            );
            e.target.position({ x: cx, y: cy });
            updateShape(shape.id, { cx, cy });
          }}
          onTransformEnd={(e): void => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            const { x: cx, y: cy } = clampXY(
              node.x(), node.y(),
              Math.abs(shape.rx) * sx * 2, Math.abs(shape.ry) * sy * 2,
            );
            updateShape(shape.id, {
              cx,
              cy,
              rx: Math.max(3, Math.abs(shape.rx) * sx),
              ry: Math.max(3, Math.abs(shape.ry) * sy),
              rotation: node.rotation(),
            });
          }}
        />
      );

    case 'arrow':
      return (
        <KArrow
          id={shape.id}
          points={shape.points}
          rotation={shape.rotation ?? 0}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          fill={shape.stroke}
          pointerLength={Math.max(8, shape.strokeWidth * 3)}
          pointerWidth={Math.max(8, shape.strokeWidth * 3)}
          // stroke 가 얇아도 hit 잡기 쉽도록 — 이거 없으면 marquee 후 drag 시
          // 사용자가 화살표 외곽선 정확히 안 누르면 hit 안 받아 그룹 drag 실패.
          hitStrokeWidth={Math.max(20, shape.strokeWidth + 16)}
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onContextMenu={handleContextMenu}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            const rawDx = e.target.x();
            const rawDy = e.target.y();
            const { dx, dy } = clampPointsDelta(shape.points, rawDx, rawDy);
            const shifted = shape.points.map((v, i) =>
              i % 2 === 0 ? v + dx : v + dy,
            );
            updateShape(shape.id, { points: shifted });
            e.target.position({ x: 0, y: 0 });
          }}
          onTransformEnd={(e): void => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            const dx = node.x();
            const dy = node.y();
            node.scaleX(1);
            node.scaleY(1);
            node.position({ x: 0, y: 0 });
            const newPoints = shape.points.map((v, i) =>
              i % 2 === 0 ? v * sx + dx : v * sy + dy,
            );
            updateShape(shape.id, {
              points: newPoints,
              rotation: node.rotation(),
            });
          }}
        />
      );

    case 'line':
      return (
        <KLine
          id={shape.id}
          points={shape.points}
          rotation={shape.rotation ?? 0}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={Math.max(20, shape.strokeWidth + 16)}
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onContextMenu={handleContextMenu}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            const rawDx = e.target.x();
            const rawDy = e.target.y();
            const { dx, dy } = clampPointsDelta(shape.points, rawDx, rawDy);
            const shifted = shape.points.map((v, i) =>
              i % 2 === 0 ? v + dx : v + dy,
            );
            updateShape(shape.id, { points: shifted });
            e.target.position({ x: 0, y: 0 });
          }}
          onTransformEnd={(e): void => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            const dx = node.x();
            const dy = node.y();
            node.scaleX(1);
            node.scaleY(1);
            node.position({ x: 0, y: 0 });
            const newPoints = shape.points.map((v, i) =>
              i % 2 === 0 ? v * sx + dx : v * sy + dy,
            );
            updateShape(shape.id, {
              points: newPoints,
              rotation: node.rotation(),
            });
          }}
        />
      );

    case 'pen':
      return (
        <KLine
          id={shape.id}
          points={shape.points}
          rotation={shape.rotation ?? 0}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          tension={0.4}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={Math.max(20, shape.strokeWidth + 16)}
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onContextMenu={handleContextMenu}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            const rawDx = e.target.x();
            const rawDy = e.target.y();
            const { dx, dy } = clampPointsDelta(shape.points, rawDx, rawDy);
            const shifted = shape.points.map((v, i) =>
              i % 2 === 0 ? v + dx : v + dy,
            );
            updateShape(shape.id, { points: shifted });
            e.target.position({ x: 0, y: 0 });
          }}
          onTransformEnd={(e): void => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            const dx = node.x();
            const dy = node.y();
            node.scaleX(1);
            node.scaleY(1);
            node.position({ x: 0, y: 0 });
            const newPoints = shape.points.map((v, i) =>
              i % 2 === 0 ? v * sx + dx : v * sy + dy,
            );
            updateShape(shape.id, {
              points: newPoints,
              rotation: node.rotation(),
            });
          }}
        />
      );

    case 'text':
      return (
        <KText
          id={shape.id}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          wrap="word"
          text={shape.text || '텍스트'}
          fill={shape.fill}
          fontSize={shape.fontSize}
          fontFamily={shape.fontFamily}
          padding={4}
          visible={!isEditing}
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onContextMenu={handleContextMenu}
          onDblClick={(): void => setEditingId(shape.id)}
          onDblTap={(): void => setEditingId(shape.id)}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            const { x, y } = clampXY(e.target.x(), e.target.y(), shape.width, 0);
            e.target.position({ x, y });
            updateShape(shape.id, { x, y });
          }}
          onTransformStart={(): void => {
            textVertResizeRef.current = false;
          }}
          onTransform={(e): void => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            // 스케일 리셋 전에 현재 너비·높이를 읽는다.
            // node.width() * sx = desiredWidth: attrs_change 로 Transformer 가
            // _startAbsoluteWidth 를 매 이벤트마다 재초기화하므로 sx 는 항상
            // 직전 프레임 기준 증분값 — 누적 compounding 없음.
            const { imageWidth: iw } = useEditorStore.getState();
            const newWidth = Math.max(40, Math.min(node.width() * sx, iw - node.x()));
            const newHeight = sy !== 1 ? Math.max(20, node.height() * sy) : null;
            node.scaleX(1);
            node.scaleY(1);
            node.width(newWidth);
            if (newHeight !== null) {
              textVertResizeRef.current = true;
              node.height(newHeight);
            }
          }}
          onTransformEnd={(e): void => {
            const node = e.target;
            node.scaleX(1);
            node.scaleY(1);
            const { x, y } = clampXY(node.x(), node.y());
            const { imageWidth: iw } = useEditorStore.getState();
            const newWidth = Math.max(40, Math.min(node.width(), iw - x));
            // 세로 리사이즈가 한 번이라도 있었거나 이미 고정 height 였으면 height 커밋.
            const commitHeight = textVertResizeRef.current || shape.height !== undefined;
            updateShape(shape.id, {
              x,
              y,
              width: newWidth,
              ...(commitHeight ? { height: Math.max(20, node.height()) } : {}),
            });
          }}
        />
      );

    case 'highlight':
      return (
        <KRect
          id={shape.id}
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          fill={shape.fill}
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onContextMenu={handleContextMenu}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            const { x, y } = clampXY(e.target.x(), e.target.y(), shape.w, shape.h);
            e.target.position({ x, y });
            updateShape(shape.id, { x, y });
          }}
          onTransformEnd={(e): void => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            const { x, y } = clampXY(node.x(), node.y(), shape.w * sx, shape.h * sy);
            updateShape(shape.id, {
              x,
              y,
              w: Math.max(5, shape.w * sx),
              h: Math.max(5, shape.h * sy),
            });
          }}
        />
      );

    case 'blur':
      return (
        <BlurShapeNode
          shape={shape}
          bgImage={bgImage}
          draggable={draggable}
          onSelect={onSelect}
          onContextMenu={handleContextMenu}
          onDragEnd={(node): void => {
            if (isMultiDrag()) return;
            const { x, y } = clampXY(node.x(), node.y(), shape.w, shape.h);
            node.position({ x, y });
            updateShape(shape.id, { x, y });
          }}
          onTransformEnd={(node): void => {
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            const { x, y } = clampXY(node.x(), node.y(), shape.w * sx, shape.h * sy);
            updateShape(shape.id, {
              x,
              y,
              w: Math.max(10, shape.w * sx),
              h: Math.max(10, shape.h * sy),
            });
          }}
        />
      );

    case 'mosaic':
      return (
        <MosaicShapeNode
          shape={shape}
          bgImage={bgImage}
          draggable={draggable}
          onSelect={onSelect}
          onContextMenu={handleContextMenu}
          onDragEnd={(node): void => {
            if (isMultiDrag()) return;
            const { x, y } = clampXY(node.x(), node.y(), shape.w, shape.h);
            node.position({ x, y });
            updateShape(shape.id, { x, y });
          }}
          onTransformEnd={(node): void => {
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            const { x, y } = clampXY(node.x(), node.y(), shape.w * sx, shape.h * sy);
            updateShape(shape.id, {
              x,
              y,
              w: Math.max(10, shape.w * sx),
              h: Math.max(10, shape.h * sy),
            });
          }}
        />
      );

    case 'image':
      return (
        <ImageShapeNode
          shape={shape}
          draggable={draggable}
          onSelect={onSelect}
          onContextMenu={handleContextMenu}
          onDragEnd={(node): void => {
            if (isMultiDrag()) return;
            const { x, y } = clampXY(node.x(), node.y(), shape.w, shape.h);
            node.position({ x, y });
            updateShape(shape.id, { x, y });
          }}
          onTransformEnd={(node): void => {
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            const { x, y } = clampXY(node.x(), node.y(), shape.w * sx, shape.h * sy);
            updateShape(shape.id, {
              x,
              y,
              w: Math.max(10, shape.w * sx),
              h: Math.max(10, shape.h * sy),
              rotation: node.rotation(),
            });
          }}
        />
      );

    case 'step':
      return (
        <StepShapeNode
          shape={shape}
          draggable={draggable}
          onSelect={onSelect}
          onContextMenu={handleContextMenu}
          onDragEnd={(node): void => {
            if (isMultiDrag()) return;
            const { x, y } = clampXY(node.x(), node.y());
            node.position({ x, y });
            updateShape(shape.id, { x, y });
          }}
          onTransformEnd={(node): void => {
            const scale = (node.scaleX() + node.scaleY()) / 2;
            node.scaleX(1);
            node.scaleY(1);
            const { x, y } = clampXY(node.x(), node.y());
            updateShape(shape.id, {
              x,
              y,
              fontSize: Math.max(8, shape.fontSize * scale),
            });
          }}
        />
      );

    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}
