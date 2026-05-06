import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import {
  Image as KImage,
  Layer,
  Rect as KRect,
  Stage,
  Transformer,
} from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from './state/store';
import type { Shape as ShapeData, TextShape, Tool } from './state/types';
import { Shape } from './Shape';
import { Toolbar } from './Toolbar';
import { TextEditor } from './TextEditor';

type Marquee = { x: number; y: number; w: number; h: number };

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Marquee 박스와 도형의 *교차* 판정 (PPT 식 — 도형이 박스에 조금만 닿아도 선택).
 * 좌표는 모두 Stage 좌표계 (이미지 픽셀).
 */
function intersectsMarquee(shape: ShapeData, m: Marquee): boolean {
  const bbox = shapeBBox(shape);
  if (!bbox) return false;
  return !(
    bbox.x + bbox.w < m.x ||
    bbox.x > m.x + m.w ||
    bbox.y + bbox.h < m.y ||
    bbox.y > m.y + m.h
  );
}

/** 도형 종류별 axis-aligned bounding box. 회전은 무시 (간이). */
function shapeBBox(shape: ShapeData): Marquee | null {
  switch (shape.kind) {
    case 'rect':
    case 'highlight':
    case 'blur':
      return {
        x: Math.min(shape.x, shape.x + shape.w),
        y: Math.min(shape.y, shape.y + shape.h),
        w: Math.abs(shape.w),
        h: Math.abs(shape.h),
      };
    case 'ellipse': {
      const rx = Math.abs(shape.rx);
      const ry = Math.abs(shape.ry);
      return { x: shape.cx - rx, y: shape.cy - ry, w: rx * 2, h: ry * 2 };
    }
    case 'arrow':
    case 'pen': {
      const xs = shape.points.filter((_, i) => i % 2 === 0);
      const ys = shape.points.filter((_, i) => i % 2 === 1);
      if (xs.length === 0) return null;
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return {
        x: minX,
        y: minY,
        w: Math.max(...xs) - minX,
        h: Math.max(...ys) - minY,
      };
    }
    case 'text': {
      // 대략적 추정 — 줄당 fontSize * 1.2, 문자당 fontSize * 0.6.
      const lines = (shape.text || ' ').split('\n');
      const longest = Math.max(...lines.map((l) => l.length));
      return {
        x: shape.x,
        y: shape.y,
        w: Math.max(40, longest * shape.fontSize * 0.6),
        h: lines.length * shape.fontSize * 1.2,
      };
    }
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}

/**
 * 어노테이션 에디터 메인.
 *
 * 흐름
 *   1) main 이 mount 후 file://path + 이미지 픽셀 크기 전송 (preload IPC)
 *   2) HTMLImageElement 로 로드해서 Konva Stage 의 background 에 배치
 *   3) 사용자 도구 선택 + 마우스 드래그 → 도형 생성
 *   4) ⌘C / "복사" → Stage.toDataURL → main 이 클립보드 복사 → 윈도우 닫음
 *   5) ESC / ⌘W / "취소" → main 이 윈도우 닫음
 *
 * 룰 적용
 *   - react-compiler.md   useMemo/useCallback/memo 미사용 (Compiler 자동).
 *   - null-safety.md      window.editor 미존재 시 throw.
 *   - side-effects.md     keyboard listener 는 window 단위 useEffect cleanup.
 *                         도형/도구 상태는 zustand store (Class 회피, 룰 *"Class가
 *                         짐이 되는 경우"* 정신 부합).
 *   - imperative-style.md 이벤트 핸들러 안 명령형 OK. 렌더 path declarative.
 */
export default function App(): JSX.Element {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [stageScale, setStageScale] = useState(1);
  // stage-wrap div — TextEditor portal 의 target + keydown focus 회복용.
  // callback ref + useState 로 mount 후 자동 re-render 트리거.
  const [stageWrap, setStageWrap] = useState<HTMLDivElement | null>(null);

  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const imageSrc = useEditorStore((s) => s.imageSrc);
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);
  const shapes = useEditorStore((s) => s.shapes);
  const drawing = useEditorStore((s) => s.drawing);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const marquee = useEditorStore((s) => s.marquee);
  const loadImage = useEditorStore((s) => s.loadImage);
  const startDrawing = useEditorStore((s) => s.startDrawing);
  const updateDrawing = useEditorStore((s) => s.updateDrawing);
  const finishDrawing = useEditorStore((s) => s.finishDrawing);
  const cancelDrawing = useEditorStore((s) => s.cancelDrawing);
  const selectShape = useEditorStore((s) => s.selectShape);
  const selectShapes = useEditorStore((s) => s.selectShapes);
  const setMarquee = useEditorStore((s) => s.setMarquee);
  const updateShape = useEditorStore((s) => s.updateShape);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setTool = useEditorStore((s) => s.setTool);
  const editingId = useEditorStore((s) => s.editingId);
  const setEditingId = useEditorStore((s) => s.setEditingId);

  // marquee 드래그 중인지 추적 — pointermove 에서 marquee 갱신, pointerup 에서
  // hit 판정 후 selectedIds set. ref 로 두어 재렌더 안 일으킴.
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);

  // 다중 drag 동기화 — leader 노드 drag 시 다른 selected 도 같은 delta 만큼 이동.
  // drag 시작 시점의 *모든 selected 노드 위치* 를 기록 (Konva 노드 position 기준).
  const dragLeaderIdRef = useRef<string | null>(null);
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);

  // 1) main → renderer: 이미지 path / 크기 받음.
  useEffect(() => {
    console.info('[asis editor] App mounted');
    const api = window.editor;
    if (!api) {
      console.error('[asis editor] window.editor 미노출');
      throw new Error('window.editor 가 노출되지 않았다 — preload 셋업 확인.');
    }
    api.onLoadImage((path, w, h) => {
      console.info(`[asis editor] onLoadImage 콜백 path=${path} w=${w} h=${h}`);
      loadImage(`file://${path}`, w, h);
    });
    api.ready();
    console.info('[asis editor] api.ready() 호출');
  }, [loadImage]);

  // 2) imageSrc 변하면 HTMLImageElement 로 디코딩.
  useEffect(() => {
    if (!imageSrc) return undefined;
    const img = new Image();
    img.src = imageSrc;
    let active = true;
    img.onload = (): void => {
      if (active) setBgImage(img);
    };
    img.onerror = (): void => {
      console.error('[asis] editor: image load failed', imageSrc);
    };
    return () => {
      active = false;
    };
  }, [imageSrc]);

  // 3) 컨테이너 사이즈 변할 때마다 Stage scale 재계산 (Retina/축소 표시).
  useEffect(() => {
    if (!imageWidth || !imageHeight) return undefined;
    const recompute = (): void => {
      const el = containerRef.current;
      if (!el) return;
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      const scale = Math.min(availW / imageWidth, availH / imageHeight, 1);
      setStageScale(scale);
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [imageWidth, imageHeight]);

  // 4) 키보드 단축키.
  // editing 중에는 글로벌 listener 를 *완전히 무시* 한다. native window 단위라
  // React 의 e.stopPropagation 으로 못 막혀서 textarea 와 도구 단축키가 동시에
  // 발화하는 문제를 차단.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useEditorStore.getState();
      console.info(
        `[asis editor] keydown key=${e.key} code=${e.code} editingId=${st.editingId} selected=${st.selectedIds.length}`,
      );
      if (st.editingId !== null) return;
      const isMeta = e.metaKey || e.ctrlKey;
      // e.code 는 *물리 키 코드* (KeyV/KeyR…) — 한영 IME, 대소문자, Caps Lock 무관.
      // e.key 는 한글 IME 켜진 상태에서 'ㅍ' 같은 한글 자모로 들어와 매핑이 깨짐.
      if (isMeta && e.code === 'KeyC') {
        e.preventDefault();
        copyToClipboard(stageRef.current);
      } else if (isMeta && !e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        undo();
      } else if (isMeta && e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        redo();
      } else if (isMeta && e.code === 'KeyW') {
        e.preventDefault();
        cancelEditor();
      } else if (e.key === 'Escape') {
        cancelEditor();
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        useEditorStore.getState().selectedIds.length > 0
      ) {
        e.preventDefault();
        deleteSelected();
      } else if (!isMeta && !e.shiftKey) {
        const map: Partial<Record<string, Tool>> = {
          KeyV: 'select',
          KeyR: 'rect',
          KeyO: 'ellipse',
          KeyA: 'arrow',
          KeyP: 'pen',
          KeyT: 'text',
          KeyH: 'highlight',
          KeyB: 'blur',
        };
        const next = map[e.code];
        if (next) setTool(next);
      }
    };
    // capture phase 로 등록 — textarea 등에서 stopPropagation 해도 우리가 먼저 잡음.
    // (단, textarea active 면 editingId 체크로 단축키 무시되니 안전.)
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [undo, redo, deleteSelected, setTool]);

  // bgImage 마운트 후 stage-wrap 에 자동 focus — 처음 캡처 뜬 직후 단축키 즉시 동작.
  useEffect(() => {
    if (bgImage && stageWrap) {
      stageWrap.focus();
    }
  }, [bgImage, stageWrap]);

  // 어떤 mouseup 이든 끝난 직후 stage-wrap 에 focus 회복.
  // (단 textarea 편집 중에는 그쪽 focus 유지 — editingId 체크.)
  useEffect(() => {
    if (!stageWrap) return undefined;
    const onUp = (): void => {
      if (useEditorStore.getState().editingId !== null) return;
      // 이미 stage-wrap 에 focus 면 skip — 깜빡임 방지.
      if (document.activeElement === stageWrap) return;
      stageWrap.focus();
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, [stageWrap]);

  const onStagePointerDown = (e: Konva.KonvaEventObject<PointerEvent>): void => {
    console.info(`[asis editor] onStagePointerDown tool=${tool}`);
    const stage = e.target.getStage();
    if (!stage) {
      console.error('[asis editor] stage null in onPointerDown');
      return;
    }
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      console.error('[asis editor] pointer null');
      return;
    }
    console.info(`[asis editor] pointer pos x=${pointer.x.toFixed(0)} y=${pointer.y.toFixed(0)} tool=${tool}`);
    // Stage scale 보정 — 모든 도형 좌표는 *이미지 픽셀 단위* 로 저장.
    // 캡처 이미지 영역 [0, imageWidth/Height] 안으로 clamp — 밖에서는 그리기 시작 못 함.
    const x = clamp(pointer.x / stageScale, 0, imageWidth);
    const y = clamp(pointer.y / stageScale, 0, imageHeight);

    if (tool === 'select') {
      // 빈 영역 (Stage 자체 또는 background image layer) 클릭 → marquee 시작.
      // 도형 클릭은 Shape 의 onClick 에서 처리되므로 여기서 무시.
      const isEmpty = e.target === stage || e.target.getParent()?.attrs?.listening === false;
      if (isEmpty) {
        if (!e.evt.shiftKey) selectShape(null);
        marqueeStartRef.current = { x, y };
        setMarquee({ x, y, w: 0, h: 0 });
      }
      return;
    }

    const id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    if (tool === 'rect') {
      startDrawing({ kind: 'rect', id, x, y, w: 0, h: 0, stroke: color, strokeWidth });
    } else if (tool === 'ellipse') {
      startDrawing({ kind: 'ellipse', id, cx: x, cy: y, rx: 0, ry: 0, stroke: color, strokeWidth });
    } else if (tool === 'arrow') {
      startDrawing({
        kind: 'arrow',
        id,
        points: [x, y, x, y],
        stroke: color,
        strokeWidth,
      });
    } else if (tool === 'pen') {
      startDrawing({
        kind: 'pen',
        id,
        points: [x, y],
        stroke: color,
        strokeWidth,
      });
    } else if (tool === 'highlight') {
      startDrawing({
        kind: 'highlight',
        id,
        x,
        y,
        w: 0,
        h: 0,
        fill: 'rgba(255, 235, 59, 0.4)',
      });
    } else if (tool === 'blur') {
      startDrawing({
        kind: 'blur',
        id,
        x,
        y,
        w: 0,
        h: 0,
        blurRadius: useEditorStore.getState().blurRadius,
      });
    } else if (tool === 'text') {
      console.info(`[asis editor] text 도구 클릭 x=${x.toFixed(0)} y=${y.toFixed(0)} id=${id}`);
      const newShape: TextShape = {
        kind: 'text',
        id,
        x,
        y,
        text: '',
        fill: color,
        fontSize: 24,
      };
      startDrawing(newShape);
      finishDrawing();
      selectShape(id);
      // KText 노드가 commit 후 mount 되어 ref 가 채워질 시간이 필요해서 next tick.
      window.requestAnimationFrame(() => {
        setEditingId(id);
      });
      console.info(`[asis editor] text 도형 추가 + editingId 예약 id=${id}`);
    }
  };

  const onStagePointerMove = (e: Konva.KonvaEventObject<PointerEvent>): void => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const x = clamp(pointer.x / stageScale, 0, imageWidth);
    const y = clamp(pointer.y / stageScale, 0, imageHeight);

    // marquee 드래그 중 — 박스 갱신.
    if (marqueeStartRef.current) {
      const start = marqueeStartRef.current;
      setMarquee({
        x: Math.min(start.x, x),
        y: Math.min(start.y, y),
        w: Math.abs(x - start.x),
        h: Math.abs(y - start.y),
      });
      return;
    }

    if (!drawing) return;

    updateDrawing((shape: ShapeData): ShapeData => {
      switch (shape.kind) {
        case 'rect':
          return { ...shape, w: x - shape.x, h: y - shape.y };
        case 'ellipse':
          return { ...shape, rx: x - shape.cx, ry: y - shape.cy };
        case 'arrow': {
          const [x1, y1] = shape.points;
          return { ...shape, points: [x1, y1, x, y] };
        }
        case 'pen':
          return { ...shape, points: [...shape.points, x, y] };
        case 'highlight':
          return { ...shape, w: x - shape.x, h: y - shape.y };
        case 'blur':
          return { ...shape, w: x - shape.x, h: y - shape.y };
        case 'text':
          return shape;
        default: {
          const _exhaustive: never = shape;
          return _exhaustive;
        }
      }
    });
  };

  const onStagePointerUp = (e: Konva.KonvaEventObject<PointerEvent>): void => {
    // marquee 종료 — hit 판정 후 selectedIds 갱신.
    if (marqueeStartRef.current) {
      const m = useEditorStore.getState().marquee;
      marqueeStartRef.current = null;
      setMarquee(null);
      if (m && (m.w > 4 || m.h > 4)) {
        const hits = shapes
          .filter((s) => intersectsMarquee(s, m))
          .map((s) => s.id);
        if (e.evt.shiftKey) {
          // 기존 선택 + 새 hits (중복 제거).
          const merged = Array.from(new Set([...selectedIds, ...hits]));
          selectShapes(merged);
        } else {
          selectShapes(hits);
        }
      }
      return;
    }

    if (!drawing) return;

    // 너무 작은 도형 (잘못 클릭) 은 폐기.
    const isTooSmall = ((): boolean => {
      switch (drawing.kind) {
        case 'rect':
        case 'highlight':
        case 'blur':
          return Math.abs(drawing.w) < 4 || Math.abs(drawing.h) < 4;
        case 'ellipse':
          return Math.abs(drawing.rx) < 4 || Math.abs(drawing.ry) < 4;
        case 'arrow':
        case 'pen': {
          const pts = drawing.points;
          if (pts.length < 4) return true;
          const dx = pts[pts.length - 2] - pts[0];
          const dy = pts[pts.length - 1] - pts[1];
          return dx * dx + dy * dy < 16;
        }
        case 'text':
          return false;
        default: {
          const _exhaustive: never = drawing;
          return _exhaustive;
        }
      }
    })();

    if (isTooSmall) {
      cancelDrawing();
      return;
    }

    finishDrawing();
  };

  const onCopyClick = (): void => {
    copyToClipboard(stageRef.current);
  };

  const onCancelClick = (): void => {
    cancelEditor();
  };

  // 다중 drag — react-konva Stage prop 으로는 자식 drag 가 안 잡혀 imperative 등록.
  // selectedIds 가 변할 때마다 listener 갱신.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const onDragStart = (e: Konva.KonvaEventObject<DragEvent>): void => {
      const id = e.target.id();
      if (!id) return;
      const sel = useEditorStore.getState().selectedIds;
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
      const allShapes = useEditorStore.getState().shapes;
      positions.forEach((startPos, sid) => {
        const sh = allShapes.find((s) => s.id === sid);
        if (!sh) return;
        switch (sh.kind) {
          case 'rect':
          case 'highlight':
          case 'blur':
          case 'text':
            updateShape(sid, { x: startPos.x + dx, y: startPos.y + dy });
            break;
          case 'ellipse':
            updateShape(sid, { cx: startPos.x + dx, cy: startPos.y + dy });
            break;
          case 'arrow':
          case 'pen': {
            const newPoints = sh.points.map((v, i) =>
              i % 2 === 0 ? v + dx : v + dy,
            );
            updateShape(sid, { points: newPoints });
            break;
          }
        }
      });
      // arrow/pen 의 노드 position 을 0 으로 reset (points 에 baking 했으므로).
      positions.forEach((_, sid) => {
        const node = stage.findOne(`#${sid}`);
        if (!node) return;
        const sh = allShapes.find((s) => s.id === sid);
        if (sh && (sh.kind === 'arrow' || sh.kind === 'pen')) {
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
  }, [updateShape, bgImage]);

  // Transformer 를 selectedIds 의 도형들에 attach. select 도구일 때만 보임.
  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return undefined;
    if (selectedIds.length === 0 || tool !== 'select') {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return undefined;
    }
    const nodes = selectedIds
      .map((id) => stage.findOne(`#${id}`))
      .filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
    return undefined;
  }, [selectedIds, tool, shapes]);

  // 인라인 텍스트 편집 대상 찾기.
  const editingShape = editingId
    ? (shapes.find((s) => s.id === editingId) ?? null)
    : null;
  const editingText = editingShape && editingShape.kind === 'text'
    ? editingShape
    : null;

  // 회전·리사이즈 활성 여부.
  // - 리사이즈는 항상 (단일/다중 모두 핸들 보이게).
  // - 회전은 단일 + rect/ellipse 만 (Arrow/Pen points 회전 미구현, 다중 회전도 미구현).
  const singleSelected = selectedIds.length === 1
    ? (shapes.find((s) => s.id === selectedIds[0]) ?? null)
    : null;
  const canRotate = !!singleSelected && (
    singleSelected.kind === 'rect' || singleSelected.kind === 'ellipse'
  );
  const canResize = true;

  // 다중 선택 시 그룹 bbox — 박스 안 빈 공간 클릭으로도 group drag 가능하도록
  // invisible draggable rect 영역 결정.
  const groupBBox = ((): Marquee | null => {
    if (selectedIds.length <= 1) return null;
    const selected = shapes.filter((s) => selectedIds.includes(s.id));
    const boxes = selected
      .map((s) => shapeBBox(s))
      .filter((b): b is Marquee => b !== null);
    if (boxes.length === 0) return null;
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  })();

  return (
    <div className="editor">
      <div className="editor__canvas" ref={containerRef}>
        {bgImage && imageWidth > 0 && imageHeight > 0 ? (
          <div
            className="stage-wrap"
            ref={setStageWrap}
            tabIndex={-1}
            style={{
              width: imageWidth * stageScale,
              height: imageHeight * stageScale,
              outline: 'none',
            }}
            onMouseDown={(): void => {
              // canvas 클릭 후에도 keydown 이 잡히도록 focus 회복.
              // textarea 가 active 면 그쪽 focus 유지.
              if (useEditorStore.getState().editingId === null) {
                stageWrap?.focus();
              }
            }}
          >
            <Stage
              ref={stageRef}
              width={imageWidth * stageScale}
              height={imageHeight * stageScale}
              scaleX={stageScale}
              scaleY={stageScale}
              onPointerDown={onStagePointerDown}
              onPointerMove={onStagePointerMove}
              onPointerUp={onStagePointerUp}
              style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
            >
              <Layer listening={false}>
                <KImage image={bgImage} width={imageWidth} height={imageHeight} />
              </Layer>

              <Layer
                clipX={0}
                clipY={0}
                clipWidth={imageWidth}
                clipHeight={imageHeight}
              >
                {/* 다중 선택 그룹 박스 — 빈 공간 클릭으로도 그룹 drag 가능.
                    도형들보다 *먼저* 렌더해서 z-order 아래로 → 도형 hit 우선,
                    도형 없는 빈 공간만 이 rect 가 잡아 group drag 시작. */}
                {groupBBox ? (
                  <KRect
                    id="__group_drag__"
                    x={groupBBox.x}
                    y={groupBBox.y}
                    width={groupBBox.w}
                    height={groupBBox.h}
                    fill="rgba(0,0,0,0.001)"
                    draggable
                    onDragStart={(): void => {
                      const stage = stageRef.current;
                      if (!stage) return;
                      const positions = new Map<string, { x: number; y: number }>();
                      selectedIds.forEach((sid) => {
                        const node = stage.findOne(`#${sid}`);
                        if (node) positions.set(sid, { x: node.x(), y: node.y() });
                      });
                      dragStartPositionsRef.current = positions;
                      dragLeaderIdRef.current = '__group_drag__';
                      // 그룹 rect 자기 시작 위치도 기록.
                      positions.set('__group_drag__', {
                        x: groupBBox.x,
                        y: groupBBox.y,
                      });
                    }}
                    onDragMove={(e): void => {
                      const positions = dragStartPositionsRef.current;
                      if (!positions) return;
                      const start = positions.get('__group_drag__');
                      if (!start) return;
                      const dx = e.target.x() - start.x;
                      const dy = e.target.y() - start.y;
                      const stage = stageRef.current;
                      if (!stage) return;
                      selectedIds.forEach((sid) => {
                        const startPos = positions.get(sid);
                        const node = stage.findOne(`#${sid}`);
                        if (!startPos || !node) return;
                        node.x(startPos.x + dx);
                        node.y(startPos.y + dy);
                      });
                      stage.batchDraw();
                    }}
                    onDragEnd={(e): void => {
                      const positions = dragStartPositionsRef.current;
                      if (!positions) return;
                      const start = positions.get('__group_drag__');
                      if (!start) return;
                      const dx = e.target.x() - start.x;
                      const dy = e.target.y() - start.y;
                      const allShapes = useEditorStore.getState().shapes;
                      selectedIds.forEach((sid) => {
                        const sh = allShapes.find((s) => s.id === sid);
                        const startPos = positions.get(sid);
                        if (!sh || !startPos) return;
                        switch (sh.kind) {
                          case 'rect':
                          case 'highlight':
                          case 'blur':
                          case 'text':
                            updateShape(sid, {
                              x: startPos.x + dx,
                              y: startPos.y + dy,
                            });
                            break;
                          case 'ellipse':
                            updateShape(sid, {
                              cx: startPos.x + dx,
                              cy: startPos.y + dy,
                            });
                            break;
                          case 'arrow':
                          case 'pen': {
                            const newPoints = sh.points.map((v, i) =>
                              i % 2 === 0 ? v + dx : v + dy,
                            );
                            updateShape(sid, { points: newPoints });
                            break;
                          }
                        }
                      });
                      // arrow/pen 노드 position reset.
                      const stage = stageRef.current;
                      if (stage) {
                        selectedIds.forEach((sid) => {
                          const sh = allShapes.find((s) => s.id === sid);
                          const node = stage.findOne(`#${sid}`);
                          if (!node || !sh) return;
                          if (sh.kind === 'arrow' || sh.kind === 'pen') {
                            node.position({ x: 0, y: 0 });
                          }
                        });
                      }
                      // 그룹 rect 자기 위치도 reset (다음 렌더에서 groupBBox 새로 계산).
                      e.target.position({ x: groupBBox.x, y: groupBBox.y });
                      dragStartPositionsRef.current = null;
                      dragLeaderIdRef.current = null;
                    }}
                  />
                ) : null}
                {shapes.map((s) => (
                  <Shape
                    key={s.id}
                    shape={s}
                    selected={selectedIds.includes(s.id)}
                    bgImage={bgImage}
                    isEditing={s.id === editingId}
                    onSelect={(evt): void => {
                      // 도형 클릭 시 어느 도구든 선택 가능 (Figma 결).
                      // shift 누르면 토글 추가 선택.
                      selectShape(s.id, evt?.evt?.shiftKey ?? false);
                    }}
                  />
                ))}
                {drawing ? (
                  <Shape
                    shape={drawing}
                    selected={false}
                    bgImage={bgImage}
                    onSelect={(): void => {}}
                  />
                ) : null}
                {marquee && tool === 'select' ? (
                  <KRect
                    x={marquee.x}
                    y={marquee.y}
                    width={marquee.w}
                    height={marquee.h}
                    fill="rgba(94, 162, 255, 0.12)"
                    stroke="#5ea2ff"
                    strokeWidth={1}
                    dash={[4, 4]}
                    listening={false}
                  />
                ) : null}
                {tool === 'select' ? (
                  <Transformer
                    ref={transformerRef}
                    rotateEnabled={canRotate}
                    resizeEnabled={canResize}
                    rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                    rotationSnapTolerance={6}
                    borderStroke="#5ea2ff"
                    borderStrokeWidth={1}
                    anchorFill="#ffffff"
                    anchorStroke="#5ea2ff"
                    anchorStrokeWidth={1}
                    anchorSize={10}
                  />
                ) : null}
              </Layer>
            </Stage>
            {editingText && stageWrap ? (
              <TextEditor
                shape={editingText}
                stageWrap={stageWrap}
                stageScale={stageScale}
              />
            ) : null}
          </div>
        ) : (
          <div className="editor__empty">캡처를 불러오는 중…</div>
        )}
      </div>

      <Toolbar onCopy={onCopyClick} onCancel={onCancelClick} />
    </div>
  );
}

function copyToClipboard(stage: Konva.Stage | null): void {
  const api = window.editor;
  if (!api) {
    throw new Error('window.editor 미노출 — preload 셋업 확인.');
  }
  if (!stage) {
    throw new Error('Stage ref 가 null — 이미지 로드 실패 가능.');
  }
  // pixelRatio 2 = Retina 품질. dataURL 으로 PNG 합성.
  const dataUrl = stage.toDataURL({ pixelRatio: 2 });
  api.copy(dataUrl).catch((err: unknown) => {
    console.error('[asis] editor.copy rejected', err);
  });
}

function cancelEditor(): void {
  const api = window.editor;
  if (!api) {
    throw new Error('window.editor 미노출 — preload 셋업 확인.');
  }
  api.cancel();
}
