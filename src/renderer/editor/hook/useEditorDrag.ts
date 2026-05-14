import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '../lib/store';

/**
 * 다중 선택 drag 동기화 — Konva Stage imperative 이벤트.
 *
 * leader 노드(실제 도형) drag 시 다른 selected 노드도 같은 delta 만큼 이동.
 *
 * 범위: 실제 도형 노드가 leader 인 경우만 처리.
 * __group_drag__ KRect drag 는 Editor.tsx 의 JSX 핸들러가 별도 로컬 ref 로 처리.
 * 두 경우는 동시에 발생하지 않으므로 ref 공유 없이 독립.
 */
export function useEditorDrag(stageRef: RefObject<Konva.Stage | null>): void {
  const dragLeaderIdRef = useRef<string | null>(null);
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const onDragStart = (e: Konva.KonvaEventObject<DragEvent>): void => {
      const id = e.target.id();
      if (!id) return;
      const sel = useEditorStore.getState().selectedIds;
      // __group_drag__ 는 이 hook 이 처리하지 않음 (JSX 핸들러 담당).
      if (id === '__group_drag__') return;
      if (!sel.includes(id) || sel.length <= 1) return;
      const positions = new Map<string, { x: number; y: number }>();
      sel.forEach((sid) => {
        const node = stage.findOne(`#${sid}`);
        if (node) positions.set(sid, { x: node.x(), y: node.y() });
      });
      dragStartPositionsRef.current = positions;
      dragLeaderIdRef.current = id;
    };

    const onDragMove = (e: Konva.KonvaEventObject<DragEvent>): void => {
      const positions = dragStartPositionsRef.current;
      const leaderId = dragLeaderIdRef.current;
      if (!positions || !leaderId) return;
      if (e.target.id() !== leaderId) return;
      const start = positions.get(leaderId);
      if (!start) return;
      const dx = e.target.x() - start.x;
      const dy = e.target.y() - start.y;
      positions.forEach((startPos, sid) => {
        if (sid === leaderId) return;
        const node = stage.findOne(`#${sid}`);
        if (!node) return;
        node.x(startPos.x + dx);
        node.y(startPos.y + dy);
      });
      stage.batchDraw();
    };

    const onDragEnd = (e: Konva.KonvaEventObject<DragEvent>): void => {
      const positions = dragStartPositionsRef.current;
      const leaderId = dragLeaderIdRef.current;
      if (!positions || !leaderId) return;
      if (e.target.id() !== leaderId) return;
      const start = positions.get(leaderId);
      if (!start) return;
      const dx = e.target.x() - start.x;
      const dy = e.target.y() - start.y;
      const { shapes, updateShape } = useEditorStore.getState();
      positions.forEach((startPos, sid) => {
        const sh = shapes.find((s) => s.id === sid);
        if (!sh) return;
        switch (sh.kind) {
          case 'rect':
          case 'highlight':
          case 'blur':
          case 'mosaic':
          case 'image':
          case 'text':
          case 'step':
            updateShape(sid, { x: startPos.x + dx, y: startPos.y + dy });
            break;
          case 'ellipse':
            updateShape(sid, { cx: startPos.x + dx, cy: startPos.y + dy });
            break;
          case 'arrow':
          case 'line':
          case 'pen': {
            const newPoints = sh.points.map((v, i) =>
              i % 2 === 0 ? v + dx : v + dy,
            );
            updateShape(sid, { points: newPoints });
            break;
          }
        }
      });
      positions.forEach((_, sid) => {
        const node = stage.findOne(`#${sid}`);
        if (!node) return;
        const sh = shapes.find((s) => s.id === sid);
        if (sh && (sh.kind === 'arrow' || sh.kind === 'line' || sh.kind === 'pen')) {
          node.position({ x: 0, y: 0 });
        }
      });
      dragStartPositionsRef.current = null;
      dragLeaderIdRef.current = null;
    };

    stage.on('dragstart', onDragStart);
    stage.on('dragmove', onDragMove);
    stage.on('dragend', onDragEnd);
    return () => {
      stage.off('dragstart', onDragStart);
      stage.off('dragmove', onDragMove);
      stage.off('dragend', onDragEnd);
    };
  }, [stageRef]);
}
