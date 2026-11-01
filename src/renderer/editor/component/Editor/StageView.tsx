import type { DragEvent, JSX, RefObject } from 'react';
import { Image as KImage, Layer, Stage } from 'react-konva';
import type Konva from 'konva';
import type { TextShape } from '../../types/shapes';
import { useEditorStore } from '../../lib/store';
import { addImageFromSource } from '../../lib/image-utils';
import { stageCursor } from '../../lib/cursors';
import { useStagePointer } from '../../hook/useStagePointer';
import type { ContextMenuState } from '../../hook/useContextMenu';
import { TextEditor } from '../TextEditor';
import { AnnotationLayer } from './AnnotationLayer';
import { CropLayer } from './CropLayer';

/** 이미지 파일 drop — drop 위치를 stage(이미지) 좌표로 변환해 그 자리에 추가. */
function dropImage(e: DragEvent<HTMLDivElement>, stageScale: number): void {
  e.preventDefault();
  const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
  if (!file) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const hint = { x: (e.clientX - rect.left) / stageScale, y: (e.clientY - rect.top) / stageScale };
  addImageFromSource(file, hint).catch((err: unknown) => console.error('[asis editor] drop 실패', err));
}

/** 인라인 텍스트 편집 대상 — 편집 중인 도형이 text 일 때만. */
function useEditingText(): TextShape | null {
  const editingId = useEditorStore((s) => s.editingId);
  const shapes = useEditorStore((s) => s.shapes);
  const shape = editingId === null ? undefined : shapes.find((s) => s.id === editingId);
  return shape?.kind === 'text' ? shape : null;
}

export type StageViewProps = {
  stageRef: RefObject<Konva.Stage | null>;
  transformerRef: RefObject<Konva.Transformer | null>;
  bgImage: HTMLImageElement;
  stageScale: number;
  stageWrap: HTMLDivElement | null;
  setStageWrap: (el: HTMLDivElement | null) => void;
  onShapeContextMenu: (menu: ContextMenuState) => void;
};

/** stage-wrap(TextEditor 오버레이 기준점) + Konva Stage(배경 이미지 + 도형 레이어). */
export function StageView({
  stageRef,
  transformerRef,
  bgImage,
  stageScale,
  stageWrap,
  setStageWrap,
  onShapeContextMenu,
}: StageViewProps): JSX.Element {
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);
  const tool = useEditorStore((s) => s.tool);
  const cropping = useEditorStore((s) => s.cropping);
  const editingText = useEditingText();
  const pointer = useStagePointer(stageScale);

  return (
    <div
      className="stage-wrap"
      ref={setStageWrap}
      tabIndex={-1}
      style={{
        position: 'relative',
        width: imageWidth * stageScale,
        height: imageHeight * stageScale,
        overflow: 'hidden',
        outline: 'none',
        // 줌으로 컨테이너보다 커져도 줄어들지 않게 + 작을 땐 중앙 정렬.
        // (flex 컨테이너의 justify/align center 는 overflow 시 시작 부분이
        //  스크롤 불가로 잘리는 문제가 있어 margin:auto 방식을 쓴다.)
        flex: '0 0 auto',
        margin: 'auto',
      }}
      // 항상 focus 를 stageWrap 으로 — 텍스트 편집 중이면 textarea.blur → commit,
      // 아니면 keydown 단축키가 stageWrap 에서 잡히도록 유지.
      onMouseDown={(): void => stageWrap?.focus()}
      onDragOver={(e): void => {
        // OS 가 파일을 새 탭에서 열어버리지 않도록 default 막기.
        e.preventDefault();
        const { dataTransfer } = e;
        dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e): void => dropImage(e, stageScale)}
      // 드래그 중 포인터를 잃으면(시스템 제스처 등) 드래그 상태를 버린다 — useStagePointer 주석.
      // capture 단계로 받는다: Konva 는 pointercancel 때 커서 아래 도형에 pointerup 을 합성해
      // bubble 시키므로(konva/lib/Stage.js _pointercancel), 그보다 먼저(React 루트의 capture
      // 리스너는 content 요소의 bubble 리스너보다 앞선다) 상태를 비워야 "취소 = 커밋" 이 안 된다.
      onPointerCancelCapture={pointer.onPointerCancel}
      onLostPointerCapture={pointer.onPointerCancel}
    >
      <Stage
        ref={stageRef}
        width={imageWidth * stageScale}
        height={imageHeight * stageScale}
        scaleX={stageScale}
        scaleY={stageScale}
        onPointerDown={pointer.onPointerDown}
        onPointerMove={pointer.onPointerMove}
        onPointerUp={pointer.onPointerUp}
        onContextMenu={(e): void => { e.evt.preventDefault(); }}
        style={{
          cursor: cropping ? 'crosshair' : stageCursor(tool),
          // 텍스트 편집 중 canvas 가 pointer 이벤트를 먹으면 textarea 내부
          // 마우스 드래그 텍스트 선택이 중단된다. 편집 중엔 canvas 를 투과.
          pointerEvents: editingText ? 'none' : undefined,
        }}
      >
        <Layer listening={false}>
          <KImage image={bgImage} width={imageWidth} height={imageHeight} />
        </Layer>
        <AnnotationLayer
          stageRef={stageRef}
          transformerRef={transformerRef}
          bgImage={bgImage}
          stageScale={stageScale}
          onShapeContextMenu={onShapeContextMenu}
        />
        {cropping ? <CropLayer stageScale={stageScale} /> : null}
      </Stage>
      {editingText && stageWrap ? (
        <TextEditor
          shape={editingText}
          stageWrap={stageWrap}
          stageScale={stageScale}
          imageWidth={imageWidth}
        />
      ) : null}
    </div>
  );
}
