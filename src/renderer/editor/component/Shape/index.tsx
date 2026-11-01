import type { JSX } from 'react';
import { Rect as KRect } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../../lib/store';
import { clampXY, commitBoxDrag, commitBoxTransform } from '../../lib/shape-transform';
import { isMultiDrag, isStrokedShape, type NodeCommon } from '../../lib/shape-node';
import type {
  BlurShape,
  HighlightShape,
  ImageShape,
  MosaicShape,
  Shape as ShapeData,
  StepShape,
} from '../../types/shapes';
import type { ShapeBackground } from '../../types/background';
import { BlurShapeNode } from './BlurShapeNode';
import { ImageShapeNode } from './ImageShapeNode';
import { MosaicShapeNode } from './MosaicShapeNode';
import { StepShapeNode } from './StepShapeNode';
import { StrokedShapeNode } from './StrokedShapeNode';
import { TextShapeNode } from './TextShapeNode';

const noop = (): void => {};

/**
 * 단일 도형 렌더 컴포넌트 — 종류별 노드 컴포넌트로 분기.
 *
 * 룰
 *   - 모든 도형: id 부여 (Transformer 가 stage.findOne(`#${id}`) 로 attach).
 *   - selected 시 draggable + Transformer 핸들 표시 + onTransformEnd 에서 store 갱신
 *     (Konva 표준 패턴: scale 을 적용 후 1로 reset, 새 width/height 를 store 에 반영).
 *   - text 더블클릭 → editingId 설정 → Editor 가 인라인 textarea 띄움.
 *   - blur 는 배경(background)을 crop + Konva.Filters.Blur + node.cache() 로 *진짜* 가우시안.
 *
 * clamp/scale-reset 로직은 lib/shape-transform 으로 추출 (도형별 노드가 공유).
 * dragBoundFunc 은 폐기 — 도형 종류별 좌표계가 달라(특히 arrow/pen 의 node.position 이 (0,0))
 * 일률적 clamp 가 음수 방향 이동을 막아 막혔다. onDragEnd 에서 post-clamp 처리.
 */
export function Shape({
  shape,
  selected,
  background,
  isEditing = false,
  onSelect,
  onContextMenu = noop,
}: {
  shape: ShapeData;
  selected: boolean;
  /**
   * 블러·모자이크가 잘라 쓸 배경과 배율 (lib/background.backgroundFor). 배경 없는 화면
   * (GIF 재생 오버레이)은 null — 그 도형은 검정 자리표시로 그린다.
   */
  background: ShapeBackground | null;
  /** 텍스트 인라인 편집 중일 때 KText 를 숨김. */
  isEditing?: boolean;
  onSelect: NodeCommon['onSelect'];
  onContextMenu?: NodeCommon['onContextMenu'];
}): JSX.Element {
  const common: NodeCommon = { draggable: selected, onSelect, onContextMenu };
  if (isStrokedShape(shape)) return <StrokedShapeNode shape={shape} {...common} />;
  switch (shape.kind) {
    case 'text':
      return <TextShapeNode shape={shape} isEditing={isEditing} {...common} />;
    case 'highlight':
      return <HighlightNode shape={shape} {...common} />;
    case 'blur':
      return <BlurNode shape={shape} background={background} {...common} />;
    case 'mosaic':
      return <MosaicNode shape={shape} background={background} {...common} />;
    case 'image':
      return <ImageNode shape={shape} {...common} />;
    case 'step':
      return <StepNode shape={shape} {...common} />;
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}

/** highlight — rotation 미커밋, 박스 위치·크기만 갱신. */
function HighlightNode({ shape, ...common }: NodeCommon & { shape: HighlightShape }): JSX.Element {
  const updateShape = useEditorStore((s) => s.updateShape);
  return (
    <KRect
      id={shape.id}
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      fill={shape.fill}
      draggable={common.draggable}
      onClick={common.onSelect}
      onTap={common.onSelect}
      onContextMenu={common.onContextMenu}
      onDragEnd={(e): void => {
        if (isMultiDrag()) return;
        updateShape(shape.id, commitBoxDrag(e.target, shape.w, shape.h));
      }}
      onTransformEnd={(e): void => {
        updateShape(shape.id, commitBoxTransform(e.target, { w: shape.w, h: shape.h }, 5));
      }}
    />
  );
}

/** blur/mosaic/image 공통 dragend — 경계 clamp 후 위치 커밋. */
function useBoxDragEnd(shape: { id: string; w: number; h: number }): (node: Konva.Node) => void {
  const updateShape = useEditorStore((s) => s.updateShape);
  return (node) => {
    if (isMultiDrag()) return;
    updateShape(shape.id, commitBoxDrag(node, shape.w, shape.h));
  };
}

function BlurNode({
  shape,
  background,
  ...common
}: NodeCommon & { shape: BlurShape; background: ShapeBackground | null }): JSX.Element {
  const updateShape = useEditorStore((s) => s.updateShape);
  return (
    <BlurShapeNode
      shape={shape}
      background={background}
      {...common}
      onDragEnd={useBoxDragEnd(shape)}
      onTransformEnd={(node): void => {
        updateShape(shape.id, commitBoxTransform(node, { w: shape.w, h: shape.h }, 10));
      }}
    />
  );
}

function MosaicNode({
  shape,
  background,
  ...common
}: NodeCommon & { shape: MosaicShape; background: ShapeBackground | null }): JSX.Element {
  const updateShape = useEditorStore((s) => s.updateShape);
  return (
    <MosaicShapeNode
      shape={shape}
      background={background}
      {...common}
      onDragEnd={useBoxDragEnd(shape)}
      onTransformEnd={(node): void => {
        updateShape(shape.id, commitBoxTransform(node, { w: shape.w, h: shape.h }, 10));
      }}
    />
  );
}

function ImageNode({ shape, ...common }: NodeCommon & { shape: ImageShape }): JSX.Element {
  const updateShape = useEditorStore((s) => s.updateShape);
  return (
    <ImageShapeNode
      shape={shape}
      {...common}
      onDragEnd={useBoxDragEnd(shape)}
      onTransformEnd={(node): void => {
        const box = commitBoxTransform(node, { w: shape.w, h: shape.h }, 10);
        updateShape(shape.id, { ...box, rotation: node.rotation() });
      }}
    />
  );
}

/** step — 크기 변환은 fontSize 로 굽는다 (가로·세로 스케일 평균). */
function StepNode({ shape, ...common }: NodeCommon & { shape: StepShape }): JSX.Element {
  const updateShape = useEditorStore((s) => s.updateShape);
  return (
    <StepShapeNode
      shape={shape}
      {...common}
      onDragEnd={(node): void => {
        if (isMultiDrag()) return;
        const { x, y } = clampXY(node.position());
        node.position({ x, y });
        updateShape(shape.id, { x, y });
      }}
      onTransformEnd={(node): void => {
        const scale = (node.scaleX() + node.scaleY()) / 2;
        node.scaleX(1);
        node.scaleY(1);
        const { x, y } = clampXY(node.position());
        updateShape(shape.id, { x, y, fontSize: Math.max(8, shape.fontSize * scale) });
      }}
    />
  );
}
