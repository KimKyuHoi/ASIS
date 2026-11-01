import { useRef, type JSX, type RefObject } from 'react';
import { Rect as KRect } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../../lib/store';
import { shapeDeltaPatch } from '../../lib/shape-transform';

type Box = { x: number; y: number; w: number; h: number };
type Pos = { x: number; y: number };
/** 진행 중인 그룹 드래그 — 대상 id 와 시작 위치. */
type GroupDrag = { selectedIds: string[]; positions: Map<string, Pos> };

const GROUP_ID = '__group_drag__';

/** 드래그 시작 시점 위치 기록 — 선택 도형들 + 그룹 rect 자신. */
function recordStartPositions(
  stage: Konva.Stage,
  selectedIds: string[],
  bbox: Box,
): Map<string, Pos> {
  const positions = new Map<string, Pos>();
  selectedIds.forEach((sid) => {
    const node = stage.findOne(`#${sid}`);
    if (node) positions.set(sid, { x: node.x(), y: node.y() });
  });
  positions.set(GROUP_ID, { x: bbox.x, y: bbox.y });
  return positions;
}

/** 그룹 rect 의 이동량만큼 선택 노드를 시각적으로 이동 (store 커밋은 dragend). */
function moveNodes(stage: Konva.Stage, { selectedIds, positions }: GroupDrag, delta: Pos): void {
  selectedIds.forEach((sid) => {
    const startPos = positions.get(sid);
    const node = stage.findOne(`#${sid}`);
    if (!startPos || !node) return;
    node.x(startPos.x + delta.x);
    node.y(startPos.y + delta.y);
  });
  stage.batchDraw();
}

/**
 * dragend 커밋 — startPos 를 앵커로 넘겨 기존 `startPos + delta` 동작 보존.
 * shapeDeltaPatch 로 leader 드래그(useEditorDrag)와 동일 로직 공유.
 * arrow/line/pen 은 points 에 delta 가 반영되므로 노드 position 을 0 으로 되돌린다.
 */
function commitGroupMove(
  stage: Konva.Stage | null,
  { selectedIds, positions }: GroupDrag,
  delta: Pos,
): void {
  const { shapes, updateShape } = useEditorStore.getState();
  selectedIds.forEach((sid) => {
    const sh = shapes.find((s) => s.id === sid);
    const startPos = positions.get(sid);
    if (!sh || !startPos) return;
    updateShape(sid, shapeDeltaPatch(sh, delta, startPos));
    const node = stage?.findOne(`#${sid}`);
    if (node && (sh.kind === 'arrow' || sh.kind === 'line' || sh.kind === 'pen')) {
      node.position({ x: 0, y: 0 });
    }
  });
}

/**
 * 다중 선택 그룹 박스 — 빈 공간 클릭으로도 그룹 drag 가능.
 * 도형들보다 *먼저* 렌더해서 z-order 아래로 → 도형 hit 우선,
 * 도형 없는 빈 공간만 이 rect 가 잡아 group drag 시작.
 */
export function GroupDragRect({
  bbox,
  selectedIds,
  stageRef,
}: {
  bbox: Box;
  selectedIds: string[];
  stageRef: RefObject<Konva.Stage | null>;
}): JSX.Element {
  const startPositionsRef = useRef<Map<string, Pos> | null>(null);

  const deltaOf = (e: Konva.KonvaEventObject<DragEvent>): Pos | null => {
    const start = startPositionsRef.current?.get(GROUP_ID);
    if (!start) return null;
    return { x: e.target.x() - start.x, y: e.target.y() - start.y };
  };

  return (
    <KRect
      id={GROUP_ID}
      x={bbox.x}
      y={bbox.y}
      width={bbox.w}
      height={bbox.h}
      fill="rgba(0,0,0,0.001)"
      draggable
      onDragStart={(): void => {
        const stage = stageRef.current;
        if (!stage) return;
        startPositionsRef.current = recordStartPositions(stage, selectedIds, bbox);
      }}
      onDragMove={(e): void => {
        const positions = startPositionsRef.current;
        const delta = deltaOf(e);
        const stage = stageRef.current;
        if (!positions || !delta || !stage) return;
        moveNodes(stage, { selectedIds, positions }, delta);
      }}
      onDragEnd={(e): void => {
        const positions = startPositionsRef.current;
        const delta = deltaOf(e);
        if (!positions || !delta) return;
        commitGroupMove(stageRef.current, { selectedIds, positions }, delta);
        // 그룹 rect 자기 위치도 reset (다음 렌더에서 groupBBox 새로 계산).
        e.target.position({ x: bbox.x, y: bbox.y });
        startPositionsRef.current = null;
      }}
    />
  );
}
