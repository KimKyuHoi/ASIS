import { useEffect, useRef, type JSX, type RefObject } from 'react';
import { Layer, Rect as KRect, Transformer } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../../lib/store';
import { CROP_BOX_NAME, EDIT_HANDLE_NAME } from '../../lib/edit-ui';
import { MIN_CROP } from '../../lib/crop';
import { useChromeColors } from '../../hook/useChromeColors';
import type { CropRect } from '../../types/crop';

// 박스 안쪽 hit 영역 — Konva 는 fill 이 있어야 안쪽 클릭을 잡는다. 사실상 투명.
const HIT_FILL = 'rgba(0,0,0,0.001)';

/** 크롭 박스 바깥 4면 — 박스가 없으면 이미지 전체를 덮는다. */
function scrimRects(
  rect: CropRect | null,
  width: number,
  height: number,
): (CropRect & { key: string })[] {
  if (rect === null) return [{ key: 'all', x: 0, y: 0, w: width, h: height }];
  return [
    { key: 'top', x: 0, y: 0, w: width, h: rect.y },
    { key: 'bottom', x: 0, y: rect.y + rect.h, w: width, h: height - rect.y - rect.h },
    { key: 'left', x: 0, y: rect.y, w: rect.x, h: rect.h },
    { key: 'right', x: rect.x + rect.w, y: rect.y, w: width - rect.x - rect.w, h: rect.h },
  ];
}

/** 크롭 박스 8방향 핸들 — 회전·뒤집기 없이, 이미지 밖으로 나가거나 MIN_CROP 보다 작아지지 않게. */
function CropTransformer({
  transformerRef,
  stageScale,
}: {
  transformerRef: RefObject<Konva.Transformer | null>;
  stageScale: number;
}): JSX.Element {
  const chrome = useChromeColors();
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);
  return (
    <Transformer
      ref={transformerRef}
      rotateEnabled={false}
      flipEnabled={false}
      keepRatio={false}
      ignoreStroke
      borderStroke={chrome.accent}
      borderStrokeWidth={1}
      anchorFill={chrome.handleFill}
      anchorStroke={chrome.accent}
      anchorStrokeWidth={1}
      anchorSize={10}
      // boundBoxFunc 의 상자는 절대(화면) 좌표 — Stage 위치가 (0,0) 이라 이미지 좌표 × stageScale.
      boundBoxFunc={(oldBox, newBox): typeof newBox => {
        const maxW = imageWidth * stageScale;
        const maxH = imageHeight * stageScale;
        const min = MIN_CROP * stageScale;
        const eps = 0.5;
        const inside = newBox.x >= -eps && newBox.y >= -eps &&
        newBox.x + newBox.width <= maxW + eps && newBox.y + newBox.height <= maxH + eps;
        if (!inside || newBox.width < min || newBox.height < min) return oldBox;
        return newBox;
      }}
    />
  );
}

/**
 * 크롭 모드 오버레이 — 바깥 어둡게 + 박스(드래그로 이동) + 8방향 핸들(Transformer).
 * 새 영역 그리기는 Stage 포인터 핸들러(useStagePointer)가 맡는다.
 *
 * 박스 조작은 cropRect 만 바꾸고 undo 기록에 쌓지 않는다 — 적용(applyCrop) 한 번이 undo 1칸.
 * Layer 에 EDIT_HANDLE_NAME 을 붙여 혹시 export 가 일어나도 결과 이미지에서 빠진다.
 */
export function CropLayer({ stageScale }: { stageScale: number }): JSX.Element {
  const chrome = useChromeColors();
  const rect = useEditorStore((s) => s.cropRect);
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);
  const setCropRect = useEditorStore((s) => s.setCropRect);
  const boxRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const hasRect = rect !== null;

  // 박스가 생기고 없어질 때 Transformer 를 붙였다 뗀다 (박스 노드는 hasRect 동안 유지된다).
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const box = boxRef.current;
    tr.nodes(hasRect && box ? [box] : []);
    tr.getLayer()?.batchDraw();
  }, [hasRect]);

  const syncFromNode = (node: Konva.Rect): void => {
    // Transformer 는 scale 로 크기를 바꾼다 — 너비·높이로 옮겨 담고 scale 은 1 로 되돌린다.
    const w = node.width() * node.scaleX();
    const h = node.height() * node.scaleY();
    node.scale({ x: 1, y: 1 });
    node.size({ width: w, height: h });
    setCropRect({ x: node.x(), y: node.y(), w, h });
  };

  return (
    <Layer name={EDIT_HANDLE_NAME}>
      {scrimRects(rect, imageWidth, imageHeight).map((r) => (
        <KRect
          key={r.key}
          x={r.x}
          y={r.y}
          width={Math.max(0, r.w)}
          height={Math.max(0, r.h)}
          fill={chrome.scrim}
          listening={false}
        />
      ))}
      {rect ? (
        <KRect
          ref={boxRef}
          name={CROP_BOX_NAME}
          x={rect.x}
          y={rect.y}
          width={rect.w}
          height={rect.h}
          fill={HIT_FILL}
          stroke={chrome.accent}
          // 줌·fit 배율과 무관하게 화면에서 1px (Stage scale 을 stroke 에 적용하지 않음).
          strokeWidth={1}
          strokeScaleEnabled={false}
          draggable
          onDragMove={(e): void => {
            const node = e.target as Konva.Rect;
            node.x(Math.min(Math.max(node.x(), 0), imageWidth - node.width()));
            node.y(Math.min(Math.max(node.y(), 0), imageHeight - node.height()));
            setCropRect({ x: node.x(), y: node.y(), w: node.width(), h: node.height() });
          }}
          onTransform={(e): void => syncFromNode(e.target as Konva.Rect)}
          onMouseEnter={(e): void => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = 'move';
          }}
          onMouseLeave={(e): void => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = 'crosshair';
          }}
        />
      ) : null}
      <CropTransformer transformerRef={trRef} stageScale={stageScale} />
    </Layer>
  );
}
