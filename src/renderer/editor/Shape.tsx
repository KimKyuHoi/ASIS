import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import {
  Arrow as KArrow,
  Ellipse as KEllipse,
  Image as KImage,
  Line as KLine,
  Rect as KRect,
  Text as KText,
} from 'react-konva';
import Konva from 'konva';
import { useEditorStore } from './state/store';
import type { Shape as ShapeData } from './state/types';

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
  imageWidth,
  imageHeight,
  stageScale,
  onSelect,
}: {
  shape: ShapeData;
  selected: boolean;
  bgImage: HTMLImageElement | null;
  /** 텍스트 인라인 편집 중일 때 KText 를 숨김. */
  isEditing?: boolean;
  /** 캡처 이미지 영역 — drag 가 이 안에서만 가능하도록 제한. */
  imageWidth: number;
  imageHeight: number;
  stageScale: number;
  onSelect: (e?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
}): JSX.Element | null {
  const updateShape = useEditorStore((s) => s.updateShape);
  const setEditingId = useEditorStore((s) => s.setEditingId);
  const blurRef = useRef<Konva.Image>(null);

  // 블러 cache — shape props 변화 시 다시 cache.
  useEffect(() => {
    if (shape.kind !== 'blur') return undefined;
    const node = blurRef.current;
    if (!node) return undefined;
    node.cache();
    node.getLayer()?.batchDraw();
    return undefined;
  }, [
    shape.kind,
    shape.kind === 'blur' ? shape.x : 0,
    shape.kind === 'blur' ? shape.y : 0,
    shape.kind === 'blur' ? shape.w : 0,
    shape.kind === 'blur' ? shape.h : 0,
    shape.kind === 'blur' ? shape.blurRadius : 0,
  ]);

  // 도형 자체의 색은 *선택 여부와 무관하게* 원본 유지.
  // 선택 표시는 Transformer 의 box + 앵커가 담당 (App.tsx 에서 처리).
  const draggable = selected;

  // 다중 선택 drag 는 App.tsx 의 Stage 단위 onDragEnd 가 일괄 처리하므로
  // 개별 도형의 onDragEnd 가 자기 좌표만 patch 하면 다른 도형 갱신과 race.
  // 다중 시 자기 onDragEnd 를 skip — Stage 가 통합 처리.
  const isMultiDrag = (): boolean =>
    useEditorStore.getState().selectedIds.length > 1;

  /**
   * drag 시 도형이 캡처 영역 [0, imageW] x [0, imageH] 안에 머물도록 제한.
   * Konva 의 dragBoundFunc 은 노드의 *Stage 좌표계 후보 위치* (scale 적용된 px) 를 받음.
   * 입력 위치를 [0, imageW*scale] 로 clamp → 노드 width 도 scale 적용해서 max 빼줌.
   */
  const makeDragBound = (
    nodeW: number,
    nodeH: number,
  ): ((pos: { x: number; y: number }) => { x: number; y: number }) => {
    const maxX = Math.max(0, (imageWidth - nodeW) * stageScale);
    const maxY = Math.max(0, (imageHeight - nodeH) * stageScale);
    return (pos) => ({
      x: Math.min(Math.max(pos.x, 0), maxX),
      y: Math.min(Math.max(pos.y, 0), maxY),
    });
  };

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
          draggable={draggable}
          dragBoundFunc={makeDragBound(Math.abs(shape.w), Math.abs(shape.h))}
          onClick={onSelect}
          onTap={onSelect}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            updateShape(shape.id, { x: e.target.x(), y: e.target.y() });
          }}
          onTransformEnd={(e): void => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            updateShape(shape.id, {
              x: node.x(),
              y: node.y(),
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
          draggable={draggable}
          dragBoundFunc={makeDragBound(0, 0)}
          onClick={onSelect}
          onTap={onSelect}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            updateShape(shape.id, { cx: e.target.x(), cy: e.target.y() });
          }}
          onTransformEnd={(e): void => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            updateShape(shape.id, {
              cx: node.x(),
              cy: node.y(),
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
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          fill={shape.stroke}
          pointerLength={Math.max(8, shape.strokeWidth * 3)}
          pointerWidth={Math.max(8, shape.strokeWidth * 3)}
          draggable={draggable}
          dragBoundFunc={makeDragBound(0, 0)}
          onClick={onSelect}
          onTap={onSelect}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            const dx = e.target.x();
            const dy = e.target.y();
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
            updateShape(shape.id, { points: newPoints });
          }}
        />
      );

    case 'pen':
      return (
        <KLine
          id={shape.id}
          points={shape.points}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          tension={0.4}
          lineCap="round"
          lineJoin="round"
          draggable={draggable}
          dragBoundFunc={makeDragBound(0, 0)}
          onClick={onSelect}
          onTap={onSelect}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            const dx = e.target.x();
            const dy = e.target.y();
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
            updateShape(shape.id, { points: newPoints });
          }}
        />
      );

    case 'text':
      return (
        <KText
          id={shape.id}
          x={shape.x}
          y={shape.y}
          text={shape.text || '텍스트'}
          fill={shape.fill}
          fontSize={shape.fontSize}
          fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
          padding={4}
          visible={!isEditing}
          draggable={draggable}
          dragBoundFunc={makeDragBound(0, 0)}
          onClick={onSelect}
          onTap={onSelect}
          onDblClick={(): void => setEditingId(shape.id)}
          onDblTap={(): void => setEditingId(shape.id)}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            updateShape(shape.id, { x: e.target.x(), y: e.target.y() });
          }}
          onTransformEnd={(e): void => {
            // 텍스트는 fontSize 로 스케일 반영 (양 axis 평균).
            const node = e.target;
            const scale = (node.scaleX() + node.scaleY()) / 2;
            node.scaleX(1);
            node.scaleY(1);
            updateShape(shape.id, {
              x: node.x(),
              y: node.y(),
              fontSize: Math.max(8, shape.fontSize * scale),
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
          dragBoundFunc={makeDragBound(Math.abs(shape.w), Math.abs(shape.h))}
          onClick={onSelect}
          onTap={onSelect}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            updateShape(shape.id, { x: e.target.x(), y: e.target.y() });
          }}
          onTransformEnd={(e): void => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            updateShape(shape.id, {
              x: node.x(),
              y: node.y(),
              w: Math.max(5, shape.w * sx),
              h: Math.max(5, shape.h * sy),
            });
          }}
        />
      );

    case 'blur':
      if (!bgImage) {
        return (
          <KRect
            id={shape.id}
            x={shape.x}
            y={shape.y}
            width={shape.w}
            height={shape.h}
            fill="rgba(18, 18, 22, 0.94)"
            onClick={onSelect}
          />
        );
      }
      return (
        <KImage
          id={shape.id}
          ref={blurRef}
          image={bgImage}
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          crop={{
            x: shape.x,
            y: shape.y,
            width: shape.w,
            height: shape.h,
          }}
          filters={[Konva.Filters.Blur]}
          blurRadius={shape.blurRadius}
          draggable={draggable}
          dragBoundFunc={makeDragBound(Math.abs(shape.w), Math.abs(shape.h))}
          onClick={onSelect}
          onTap={onSelect}
          onDragEnd={(e): void => {
            if (isMultiDrag()) return;
            updateShape(shape.id, { x: e.target.x(), y: e.target.y() });
          }}
          onTransformEnd={(e): void => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            updateShape(shape.id, {
              x: node.x(),
              y: node.y(),
              w: Math.max(10, shape.w * sx),
              h: Math.max(10, shape.h * sy),
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
