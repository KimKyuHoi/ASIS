import { useEffect, useState } from 'react';
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
import type { BlurShape, ImageShape, Shape as ShapeData } from './state/types';

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
}: {
  shape: ShapeData;
  selected: boolean;
  bgImage: HTMLImageElement | null;
  /** 텍스트 인라인 편집 중일 때 KText 를 숨김. */
  isEditing?: boolean;
  onSelect: (e?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
}): JSX.Element | null {
  const updateShape = useEditorStore((s) => s.updateShape);
  const setEditingId = useEditorStore((s) => s.setEditingId);

  // 도형 자체의 색은 *선택 여부와 무관하게* 원본 유지.
  // 선택 표시는 Transformer 의 box + 앵커가 담당 (App.tsx 에서 처리).
  const draggable = selected;

  // 다중 선택 drag 는 App.tsx 의 Stage 단위 onDragEnd 가 일괄 처리하므로
  // 개별 도형의 onDragEnd 가 자기 좌표만 patch 하면 다른 도형 갱신과 race.
  // 다중 시 자기 onDragEnd 를 skip — Stage 가 통합 처리.
  const isMultiDrag = (): boolean =>
    useEditorStore.getState().selectedIds.length > 1;

  // dragBoundFunc 은 폐기 — 도형 종류별 좌표계가 달라(특히 arrow/pen 의 node.position 이 (0,0))
  // 일률적 clamp 가 음수 방향 이동을 막아 막혔다. Layer clip 이 시각 안전망 역할.

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
          fill="rgba(0,0,0,0.001)"
          draggable={draggable}
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
            // Arrow 의 rotation 은 Konva 노드 prop 으로 보존, scale 만 points 에 baking.
            // node.x/y 는 dragend 와 같은 형태 — points 시작점으로 흡수.
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
          text={shape.text || '텍스트'}
          fill={shape.fill}
          fontSize={shape.fontSize}
          fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
          padding={4}
          visible={!isEditing}
          draggable={draggable}
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
      return (
        <BlurShapeNode
          shape={shape}
          bgImage={bgImage}
          draggable={draggable}
          onSelect={onSelect}
          onDragEnd={(node): void => {
            if (isMultiDrag()) return;
            updateShape(shape.id, { x: node.x(), y: node.y() });
          }}
          onTransformEnd={(node): void => {
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

    case 'image':
      return (
        <ImageShapeNode
          shape={shape}
          draggable={draggable}
          onSelect={onSelect}
          onDragEnd={(node): void => {
            if (isMultiDrag()) return;
            updateShape(shape.id, { x: node.x(), y: node.y() });
          }}
          onTransformEnd={(node): void => {
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            updateShape(shape.id, {
              x: node.x(),
              y: node.y(),
              w: Math.max(10, shape.w * sx),
              h: Math.max(10, shape.h * sy),
              rotation: node.rotation(),
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

/**
 * 이미지 도형 — src(data URL) 을 HTMLImageElement 로 디코딩 후 KImage 렌더.
 * src 는 store 에 base64 로 저장되어 있어 mount 시 1회 디코드.
 */
function ImageShapeNode({
  shape,
  draggable,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: {
  shape: ImageShape;
  draggable: boolean;
  onSelect: (e?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragEnd: (node: Konva.Image) => void;
  onTransformEnd: (node: Konva.Image) => void;
}): JSX.Element | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;
    const el = new Image();
    el.onload = (): void => {
      if (active) setImg(el);
    };
    el.onerror = (): void => {
      console.error('[asis editor] ImageShape src 로드 실패', shape.id);
    };
    el.src = shape.src;
    return () => {
      active = false;
    };
  }, [shape.src, shape.id]);

  if (!img) return null;

  return (
    <KImage
      id={shape.id}
      image={img}
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      rotation={shape.rotation ?? 0}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e): void => onDragEnd(e.target as Konva.Image)}
      onTransformEnd={(e): void => onTransformEnd(e.target as Konva.Image)}
    />
  );
}

/**
 * 블러 도형 — 배경 이미지에서 *crop 영역만* Konva.Filters.Blur 로 가우시안 블러.
 * 별도 sub-component 인 이유:
 *   - shape.kind === 'blur' 로 type narrowed → useEffect deps 가 단순 (conditional 없음)
 *   - blur 노드 ref + cache 호출이 다른 도형과 lifecycle 다름
 */
function BlurShapeNode({
  shape,
  bgImage,
  draggable,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: {
  shape: BlurShape;
  bgImage: HTMLImageElement | null;
  draggable: boolean;
  onSelect: (e?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragEnd: (node: Konva.Image) => void;
  onTransformEnd: (node: Konva.Image) => void;
}): JSX.Element {
  const [node, setNode] = useState<Konva.Image | null>(null);

  // 블러 props 변화 시 cache 다시 — Konva 표준 패턴.
  // type narrowed 라 deps 에 conditional 없이 깔끔.
  useEffect(() => {
    if (!node) return;
    node.cache();
    node.getLayer()?.batchDraw();
  }, [node, shape.x, shape.y, shape.w, shape.h, shape.blurRadius]);

  // bgImage 미로드 — 검정 placeholder.
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
      ref={setNode}
      image={bgImage}
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      crop={{ x: shape.x, y: shape.y, width: shape.w, height: shape.h }}
      filters={[Konva.Filters.Blur]}
      blurRadius={shape.blurRadius}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e): void => onDragEnd(e.target as Konva.Image)}
      onTransformEnd={(e): void => onTransformEnd(e.target as Konva.Image)}
    />
  );
}
