import { useRef } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '../lib/store';
import { clamp } from '../lib/image-utils';
import { intersectsMarquee } from '../lib/geometry';
import { capturePointer } from '../lib/pointer-capture';
import { useCropDrag } from './useCropDrag';
import {
  createDragShape,
  isDragTool,
  isTooSmallDrawing,
  newShapeId,
  resizeDrawing,
} from '../lib/drawing';

type Point = { x: number; y: number };
type PointerEvt = Konva.KonvaEventObject<PointerEvent>;
type EditorState = ReturnType<typeof useEditorStore.getState>;

/**
 * 포인터 위치 → 이미지 좌표. Stage scale 보정 — 모든 도형 좌표는 *이미지 픽셀 단위* 로 저장.
 * 캡처 이미지 영역 [0, imageWidth/Height] 안으로 clamp — 밖에서는 그리기 시작 못 함.
 * Stage·포인터가 없으면 null (Konva 가 이벤트를 준 이상 정상적으로는 없음 — 호출부가 로그).
 */
function toImagePoint(e: PointerEvt, stageScale: number): Point | null {
  const stage = e.target.getStage();
  const pointer = stage?.getPointerPosition() ?? null;
  if (!pointer) return null;
  const { imageWidth, imageHeight } = useEditorStore.getState();
  return {
    x: clamp(pointer.x / stageScale, 0, imageWidth),
    y: clamp(pointer.y / stageScale, 0, imageHeight),
  };
}

function placeText(st: EditorState, id: string, pt: Point): void {
  console.info(`[asis editor] text 도구 클릭 x=${pt.x.toFixed(0)} y=${pt.y.toFixed(0)} id=${id}`);
  st.startDrawing({
    kind: 'text',
    id,
    x: pt.x,
    y: pt.y,
    // 기본 200px. 이미지 오른쪽 경계를 넘지 않도록 min, 너무 좁으면 40px 최소.
    width: Math.min(200, Math.max(40, st.imageWidth - pt.x)),
    text: '',
    fill: st.color,
    fontSize: st.fontSize,
    fontFamily: st.fontFamily,
    align: st.textAlign,
    lineHeight: st.lineHeight,
  });
  st.finishDrawing();
  st.selectShape(id);
  // KText 노드가 commit 후 mount 되어 ref 가 채워질 시간이 필요해서 next tick.
  window.requestAnimationFrame(() => {
    useEditorStore.getState().setEditingId(id);
  });
}

function placeStep(st: EditorState, id: string, pt: Point): void {
  st.startDrawing({
    kind: 'step', id, x: pt.x, y: pt.y, num: st.nextStepNum, fill: st.color, fontSize: st.fontSize,
  });
  st.finishDrawing();
  st.selectShape(id);
  st.incrementStepNum();
}

/** 지우개 — Group(step 등) 내부 자식 클릭 시 e.target.id()는 빈 문자열 → 부모 Group id. */
function eraseAt(st: EditorState, e: PointerEvt): void {
  const targetId = e.target.id() || (e.target.getParent()?.id() ?? '');
  if (targetId) st.deleteShape(targetId);
}

function startShape(st: EditorState, pt: Point): void {
  const id = newShapeId();
  if (isDragTool(st.tool)) {
    st.startDrawing(createDragShape(st.tool, { id, ...pt }, st));
  } else if (st.tool === 'text') {
    placeText(st, id, pt);
  } else if (st.tool === 'step') {
    placeStep(st, id, pt);
  }
}

/** marquee 종료 — hit 판정 후 선택 갱신. Shift 면 기존 선택에 합친다(중복 제거). */
function finishMarquee(st: EditorState, additive: boolean): void {
  const m = st.marquee;
  st.setMarquee(null);
  if (!m || (m.w <= 4 && m.h <= 4)) return;
  const hits = st.shapes.filter((s) => intersectsMarquee(s, m)).map((s) => s.id);
  st.selectShapes(additive ? Array.from(new Set([...st.selectedIds, ...hits])) : hits);
}

/**
 * Stage 포인터 핸들러 — 도형 그리기·marquee 선택·지우개·크롭 영역 지정.
 * 핸들러는 렌더 외부에서 호출되므로 스토어 최신값(getState)을 읽는다.
 */
export function useStagePointer(stageScale: number): {
  onPointerDown: (e: PointerEvt) => void;
  onPointerMove: (e: PointerEvt) => void;
  onPointerUp: (e: PointerEvt) => void;
  onPointerCancel: () => void;
} {
  // marquee 드래그 시작점 — move 에서 박스 갱신, up 에서 hit 판정. 재렌더 불필요라 ref.
  const marqueeStartRef = useRef<Point | null>(null);
  const crop = useCropDrag();

  const onPointerDown = (e: PointerEvt): void => {
    const st = useEditorStore.getState();
    const pt = toImagePoint(e, stageScale);
    if (!pt) {
      console.error('[asis editor] stage/pointer null in onPointerDown');
      return;
    }
    if (st.cropping) {
      crop.start(e, pt);
      return;
    }
    if (st.tool === 'select') {
      // 빈 영역 (Stage 자체 또는 background image layer) 클릭 → marquee 시작.
      // 도형 클릭은 Shape 의 onClick 에서 처리되므로 여기서 무시.
      const isEmpty =
        e.target === e.target.getStage() || e.target.getParent()?.listening() === false;
      if (!isEmpty) return;
      if (!e.evt.shiftKey) st.selectShape(null);
      capturePointer(e);
      marqueeStartRef.current = pt;
      st.setMarquee({ ...pt, w: 0, h: 0 });
    } else if (st.tool === 'eraser') {
      eraseAt(st, e);
    } else {
      capturePointer(e);
      startShape(st, pt);
    }
  };

  const onPointerMove = (e: PointerEvt): void => {
    const pt = toImagePoint(e, stageScale);
    if (!pt) return;
    if (crop.move(pt)) return;
    const st = useEditorStore.getState();
    const start = marqueeStartRef.current;
    if (start) {
      st.setMarquee({
        x: Math.min(start.x, pt.x),
        y: Math.min(start.y, pt.y),
        w: Math.abs(pt.x - start.x),
        h: Math.abs(pt.y - start.y),
      });
      return;
    }
    if (!st.drawing) return;
    st.updateDrawing((shape) => resizeDrawing(shape, pt, e.evt.shiftKey));
  };

  const onPointerUp = (e: PointerEvt): void => {
    if (crop.end()) return;
    const st = useEditorStore.getState();
    if (marqueeStartRef.current) {
      marqueeStartRef.current = null;
      finishMarquee(st, e.evt.shiftKey);
      return;
    }
    if (!st.drawing) return;
    if (isTooSmallDrawing(st.drawing)) st.cancelDrawing();
    else st.finishDrawing();
  };

  /**
   * 포인터를 잃었을 때(pointercancel·lostpointercapture) 진행 중이던 드래그를 버린다.
   * Konva 는 pointercancel 을 Stage 리스너로 넘기지 않는다(konva/lib/Stage.js _pointercancel:
   * 도형이 있을 때만 pointerup 을 대신 쏜다) — StageView 가 DOM 이벤트로 부른다.
   * 정상 pointerup 뒤의 lostpointercapture 에서는 이미 비어 있어 아무 일도 없다.
   */
  const onPointerCancel = (): void => {
    crop.cancel();
    const st = useEditorStore.getState();
    if (marqueeStartRef.current) {
      marqueeStartRef.current = null;
      st.setMarquee(null);
    }
    if (st.drawing) st.cancelDrawing();
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
