import type { JSX, RefObject } from 'react';
import { Layer, Rect as KRect, Transformer } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../../lib/store';
import { selectionInfo } from '../../lib/selection';
import { backgroundFor } from '../../lib/background';
import { CURSOR_ROTATE } from '../../lib/cursors';
import { useTransformerSync } from '../../hook/useTransformerSync';
import { useChromeColors } from '../../hook/useChromeColors';
import type { ContextMenuState } from '../../hook/useContextMenu';
import { Shape } from '../Shape';
import { EndpointHandles } from '../EndpointHandles';
import { GroupDragRect } from './GroupDragRect';

const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];

/** marquee 박스 — select 도구 빈 영역 드래그 중 임시 표시. */
function MarqueeRect(): JSX.Element | null {
  const chrome = useChromeColors();
  const marquee = useEditorStore((s) => s.marquee);
  const tool = useEditorStore((s) => s.tool);
  if (!marquee || tool !== 'select') return null;
  return (
    <KRect
      x={marquee.x}
      y={marquee.y}
      width={marquee.w}
      height={marquee.h}
      fill={chrome.accentWash}
      stroke={chrome.accent}
      strokeWidth={1}
      dash={[4, 4]}
      listening={false}
    />
  );
}

/**
 * 선택 조작 UI — 박스 변환 Transformer, 또는 arrow/line 단일 선택이면 끝점 핸들 2개.
 * select 도구일 때만. 리사이즈는 항상(단일/다중), 회전은 selectionInfo.canRotate 만.
 * 텍스트 박스도 8방향 모두 허용 — onTransform 에서 scaleY=1 고정이므로
 * 상하/코너 드래그는 너비(scaleX)만 반영, 폰트 크기는 불변.
 */
function SelectionControls({
  stageRef,
  transformerRef,
  stageScale,
}: {
  stageRef: RefObject<Konva.Stage | null>;
  transformerRef: RefObject<Konva.Transformer | null>;
  stageScale: number;
}): JSX.Element | null {
  // Transformer 와 같은 컴포넌트(같은 Konva reconciler root)에서 동기화 — Transformer 가
  // 이 컴포넌트에서 마운트되므로 effect 시점에 ref 가 항상 채워져 있다. 부모(DOM root)
  // effect 에서 하면 Konva root 커밋과의 순서에 기대게 된다.
  useTransformerSync(transformerRef, stageRef);
  const chrome = useChromeColors();
  const tool = useEditorStore((s) => s.tool);
  const shapes = useEditorStore((s) => s.shapes);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  if (tool !== 'select') return null;
  const { lineLike, canRotate } = selectionInfo(shapes, selectedIds);
  if (lineLike) {
    return (
      <EndpointHandles
        shape={lineLike}
        stageScale={stageScale}
        cursor={CURSOR_ROTATE}
        restoreCursor="default"
      />
    );
  }
  return (
    <Transformer
      ref={transformerRef}
      rotateEnabled={canRotate}
      resizeEnabled
      rotationSnaps={ROTATION_SNAPS}
      rotationSnapTolerance={6}
      borderStroke={chrome.accent}
      borderStrokeWidth={1}
      anchorFill={chrome.handleFill}
      anchorStroke={chrome.accent}
      anchorStrokeWidth={1}
      anchorSize={10}
    />
  );
}

/**
 * 도형 레이어 — 이미지 영역으로 clip.
 * 그룹 드래그 박스 → 도형들 → 그리는 중 도형 → marquee → 선택 UI 순.
 */
export function AnnotationLayer({
  stageRef,
  transformerRef,
  bgImage,
  stageScale,
  onShapeContextMenu,
}: {
  stageRef: RefObject<Konva.Stage | null>;
  transformerRef: RefObject<Konva.Transformer | null>;
  bgImage: HTMLImageElement;
  stageScale: number;
  onShapeContextMenu: (menu: ContextMenuState) => void;
}): JSX.Element {
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);
  const tool = useEditorStore((s) => s.tool);
  const shapes = useEditorStore((s) => s.shapes);
  const drawing = useEditorStore((s) => s.drawing);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const editingId = useEditorStore((s) => s.editingId);
  const selectShape = useEditorStore((s) => s.selectShape);
  // 크롭 모드에서는 도형이 클릭·드래그를 가로채지 않게 한다 (영역 지정만).
  const cropping = useEditorStore((s) => s.cropping);
  const { groupBBox } = selectionInfo(shapes, selectedIds);
  // 이 레이어는 Stage 가 그려질 때만(imageWidth > 0) 마운트된다 — StageView 상위 조건.
  const background = backgroundFor(bgImage, imageWidth);

  return (
    <Layer
      clipX={0}
      clipY={0}
      clipWidth={imageWidth}
      clipHeight={imageHeight}
      listening={!cropping}
    >
      {groupBBox ? (
        <GroupDragRect bbox={groupBBox} selectedIds={selectedIds} stageRef={stageRef} />
      ) : null}
      {shapes.map((s) => (
        <Shape
          key={s.id}
          shape={s}
          selected={selectedIds.includes(s.id)}
          background={background}
          isEditing={s.id === editingId}
          onSelect={(evt): void => {
            // 그리기 도구가 활성화된 상태에서는 기존 도형을 선택하지 않는다.
            // 클릭이 Stage onPointerDown 으로 전파되어 새 도형 그리기를 시작하도록 둔다.
            if (tool !== 'select') return;
            selectShape(s.id, evt.evt.shiftKey);
          }}
          onContextMenu={(e: Konva.KonvaEventObject<MouseEvent>): void => {
            e.evt.preventDefault();
            selectShape(s.id);
            onShapeContextMenu({ x: e.evt.clientX, y: e.evt.clientY, shapeId: s.id });
          }}
        />
      ))}
      {drawing ? (
        <Shape
          shape={drawing}
          selected={false}
          background={background}
          onSelect={(): void => {}}
        />
      ) : null}
      <MarqueeRect />
      <SelectionControls
        stageRef={stageRef}
        transformerRef={transformerRef}
        stageScale={stageScale}
      />
    </Layer>
  );
}
