import { shapeBBox } from './geometry';
import type { ArrowShape, LineShape, Shape } from '../types/shapes';

type Box = { x: number; y: number; w: number; h: number };

export type SelectionInfo = {
  /**
   * arrow/line 단일 선택 — Transformer 박스 변환 대신 끝점 핸들 2개로 조작한다.
   * (선분에 박스 스케일을 적용하면 얇은 축에서 음수/0 scale 이 나와 좌표가 날뛴다.)
   */
  lineLike: ArrowShape | LineShape | null;
  /** 회전은 단일 + rect/ellipse/pen/image 만 (다중 회전 미구현). */
  canRotate: boolean;
  /**
   * 다중 선택 시 그룹 bbox — 박스 안 빈 공간 클릭으로도 group drag 가능하도록
   * invisible draggable rect 영역 결정.
   */
  groupBBox: Box | null;
};

const ROTATABLE_KINDS = new Set<Shape['kind']>(['rect', 'ellipse', 'pen', 'image']);

function groupBBoxOf(shapes: Shape[], selectedIds: string[]): Box | null {
  if (selectedIds.length <= 1) return null;
  const boxes = shapes
    .filter((s) => selectedIds.includes(s.id))
    .map((s) => shapeBBox(s))
    .filter((b): b is Box => b !== null);
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function selectionInfo(shapes: Shape[], selectedIds: string[]): SelectionInfo {
  const single = selectedIds.length === 1
    ? (shapes.find((s) => s.id === selectedIds[0]) ?? null)
    : null;
  const lineLike = single?.kind === 'arrow' || single?.kind === 'line' ? single : null;
  return {
    lineLike,
    canRotate: single !== null && ROTATABLE_KINDS.has(single.kind),
    groupBBox: groupBBoxOf(shapes, selectedIds),
  };
}
