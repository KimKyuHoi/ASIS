import { useRef } from 'react';
import type { JSX } from 'react';
import { Circle } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../lib/store';
import { clampXY } from '../lib/shape-transform';
import { snapAngle45 } from '../lib/geometry';
import type { ArrowShape, LineShape } from '../types/shapes';

const HANDLE_FILL = '#ffffff';
const HANDLE_STROKE = '#5ea2ff';

/**
 * 화살표/직선 단일 선택 시 양 끝점에 띄우는 드래그 핸들 2개.
 *
 * 왜 Transformer 가 아니라 끝점 핸들인가:
 *   선분은 bounding box 의 한 축(선에 수직한 두께)이 0 에 가깝다. 그래서 Konva
 *   Transformer 의 박스 스케일을 적용하면 음수/0 scale 이 나와 points 가 폭발·반전한다
 *   (방향 전환 시 "날뜀"). 양 끝점을 직접 끄는 방식은 그 문제가 원천적으로 없고,
 *   한쪽 끝을 반대편으로 넘기면 방향 전환이 자연스럽게 일어난다.
 *
 * 드래그 중에는 store 를 건드리지 않는다 — updateShape 는 호출마다 undo 스택(past)에
 * 스냅샷을 쌓으므로(lib/store.ts), move 마다 커밋하면 한 번 끌기에 수백 프레임이
 * 쌓인다. 대신 화살표 Konva 노드의 points 만 imperative 로 갱신하다가, dragEnd 에서
 * clampXY 로 경계 안에 넣고 1회만 커밋한다 — undo 는 끌기당 1스텝.
 *
 * 룰: imperative-style — Konva 이벤트 핸들러 내부 명령형 OK.
 */
export function EndpointHandles({
  shape,
  stageScale,
  cursor,
  restoreCursor,
}: {
  shape: ArrowShape | LineShape;
  stageScale: number;
  /** hover/드래그 시 stage container 에 적용할 커서 (회전 화살표). */
  cursor: string;
  /** 핸들에서 벗어났을 때 되돌릴 커서 (select 도구 기본값). */
  restoreCursor: string;
}): JSX.Element {
  const updateShape = useEditorStore((s) => s.updateShape);
  // 드래그 중 onMouseLeave 가 발화해 커서가 풀리는 것을 막기 위한 플래그.
  const draggingRef = useRef(false);

  // Circle 은 Stage scaleX/Y(stageScale)를 받는 일반 노드라, 화면상 크기를 일정하게
  // 하려면 논리 크기를 1/scale 로 키운다 (Transformer anchor 는 화면 픽셀 고정이라
  // 보정이 없었지만, 여기 Circle 은 메인 Layer 안이라 scale 을 받는다).
  const r = 6 / stageScale;
  const sw = 1.5 / stageScale;
  const hit = 16 / stageScale;

  // Shift — 반대편 고정 끝점 기준으로 45° 단위 각도 스냅 (드로잉과 동일 동작).
  const snapIfShift = (
    e: Konva.KonvaEventObject<DragEvent>,
    idx: 0 | 1,
    px: number,
    py: number,
  ): { x: number; y: number } => {
    if (!e.evt.shiftKey) return { x: px, y: py };
    const ox = shape.points[(1 - idx) * 2];
    const oy = shape.points[(1 - idx) * 2 + 1];
    return snapAngle45(ox, oy, px, py);
  };

  // 끄는 끝점(idx 0 or 1)의 현재 위치로 화살표 노드 points 를 갱신. store 미터치.
  const onMove = (e: Konva.KonvaEventObject<DragEvent>, idx: 0 | 1): void => {
    const node = e.target;
    const stage = node.getStage();
    if (!stage) throw new Error('endpoint handle: drag 중 stage 가 없다');
    const lineNode = stage.findOne<Konva.Arrow | Konva.Line>(`#${shape.id}`);
    if (!lineNode) {
      throw new Error(`endpoint handle: 도형 노드 #${shape.id} 를 찾지 못했다`);
    }
    const snapped = snapIfShift(e, idx, node.x(), node.y());
    // 스냅 시 핸들 자체도 스냅 위치로 — 핸들과 선 끝이 분리돼 보이지 않게.
    if (e.evt.shiftKey) node.position(snapped);
    const pts = shape.points.slice();
    pts[idx * 2] = snapped.x;
    pts[idx * 2 + 1] = snapped.y;
    lineNode.points(pts);
    lineNode.getLayer()?.batchDraw();
  };

  const onEnd = (e: Konva.KonvaEventObject<DragEvent>, idx: 0 | 1): void => {
    draggingRef.current = false;
    const node = e.target;
    const snapped = snapIfShift(e, idx, node.x(), node.y());
    const { x, y } = clampXY(snapped.x, snapped.y);
    // clamp 결과가 직전 store 값과 우연히 같으면 prop 변화가 없어 react-konva 가
    // Circle 을 다시 옮기지 않는다 — 노드 위치도 직접 보정.
    node.position({ x, y });
    const pts = shape.points.slice();
    pts[idx * 2] = x;
    pts[idx * 2 + 1] = y;
    updateShape(shape.id, { points: pts });
  };

  const onStart = (e: Konva.KonvaEventObject<DragEvent>): void => {
    // 본체(화살표 전체 이동)·그룹 드래그·marquee 로 이벤트가 전파되지 않게 차단.
    e.cancelBubble = true;
    draggingRef.current = true;
  };

  const onEnter = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = cursor;
  };

  const onLeave = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (draggingRef.current) return; // 드래그 중엔 커서 유지
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = restoreCursor;
  };

  return (
    <>
      <Circle
        x={shape.points[0]}
        y={shape.points[1]}
        radius={r}
        fill={HANDLE_FILL}
        stroke={HANDLE_STROKE}
        strokeWidth={sw}
        hitStrokeWidth={hit}
        draggable
        onDragStart={onStart}
        onDragMove={(e): void => onMove(e, 0)}
        onDragEnd={(e): void => onEnd(e, 0)}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      />
      <Circle
        x={shape.points[2]}
        y={shape.points[3]}
        radius={r}
        fill={HANDLE_FILL}
        stroke={HANDLE_STROKE}
        strokeWidth={sw}
        hitStrokeWidth={hit}
        draggable
        onDragStart={onStart}
        onDragMove={(e): void => onMove(e, 1)}
        onDragEnd={(e): void => onEnd(e, 1)}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      />
    </>
  );
}
