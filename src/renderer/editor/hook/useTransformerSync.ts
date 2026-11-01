import { useEffect, type RefObject } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '../lib/store';

/** Transformer 를 selectedIds 의 도형들에 attach. select 도구일 때만 보임. */
export function useTransformerSync(
  transformerRef: RefObject<Konva.Transformer | null>,
  stageRef: RefObject<Konva.Stage | null>,
): void {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const tool = useEditorStore((s) => s.tool);
  const shapes = useEditorStore((s) => s.shapes);

  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = selectedIds.length === 0 || tool !== 'select'
      ? []
      : selectedIds
        .map((id) => stage.findOne(`#${id}`))
        .filter((n): n is Konva.Node => n !== undefined);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [transformerRef, stageRef, selectedIds, tool, shapes]);
}
