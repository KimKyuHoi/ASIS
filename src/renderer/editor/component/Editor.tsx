import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { createPortal } from 'react-dom';
import {
  Image as KImage,
  Layer,
  Rect as KRect,
  Stage,
  Transformer,
} from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../lib/store';
import type { LineShape, Shape as ShapeData, StepShape, TextShape } from '../types/shapes';
import { cancelEditor, copyToClipboard, stageToDataUrl } from '../lib/editor-actions';
import { addImageFromSource, clamp } from '../lib/image-utils';
import { intersectsMarquee, shapeBBox } from '../lib/geometry';
import { shapeDeltaPatch } from '../lib/shape-transform';
import { useEditorImages } from '../hook/useEditorImages';
import { useEditorKeyboard } from '../hook/useEditorKeyboard';
import { useEditorDrag } from '../hook/useEditorDrag';
import { Shape } from './Shape';
import { EndpointHandles } from './EndpointHandles';
import { Toolbar } from './Toolbar';
import { TextEditor } from './TextEditor';

type Marquee = { x: number; y: number; w: number; h: number };
type ContextMenu = { x: number; y: number; shapeId: string };

// 줌 시 Stage 캔버스 상한 (한 변, CSS px) — 대형 캡처를 최대 배율로 확대하면
// 캔버스 메모리가 수백 MB 로 튀는 것을 막는다. Retina(2x)에서는 디바이스 픽셀이
// 이 값의 2배가 되므로 Chromium canvas 한계(16384)의 절반 이하로 잡는다.
const MAX_STAGE_PX = 4096;

// 지우개 커서 — Lucide eraser 형태를 SVG data URL 로 인코딩.
// 그림자 패스(검정)를 먼저 그려 밝은/어두운 배경 모두에서 선명히 보임.
// hotspot: (2, 14) — 지우개 지우는 끝 부분(좌하단).
const CURSOR_ERASER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21' stroke='%23000' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M22 21H7' stroke='%23000' stroke-width='4' stroke-linecap='round'/%3E%3Cpath d='m5 11 9 9' stroke='%23000' stroke-width='4' stroke-linecap='round'/%3E%3Cpath d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21' fill='%23ff9999' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M22 21H7' stroke='white' stroke-width='1.8' stroke-linecap='round'/%3E%3Cpath d='m5 11 9 9' stroke='white' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E\") 2 14, auto";

// 회전 화살표 커서 — 끝점 핸들 hover/드래그 시 "방향을 바꿀 수 있는 지점"임을 알림.
// 거의 한 바퀴 도는 원호 + 끝에 화살촉. 검정 그림자(4px) 위 흰 선(2px) 2겹으로
// 밝은/어두운 배경 모두에서 선명. hotspot: 중앙(11,11).
const CURSOR_ROTATE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M12 4 A8 8 0 1 1 6.86 5.87' stroke='%23000' stroke-width='4' stroke-linecap='round'/%3E%3Cpath d='M6.86 5.87 L4 4.5 M6.86 5.87 L6.2 9' stroke='%23000' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M12 4 A8 8 0 1 1 6.86 5.87' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M6.86 5.87 L4 4.5 M6.86 5.87 L6.2 9' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") 11 11, auto";

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
export default function Editor(): JSX.Element {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // stage-wrap div — TextEditor portal 의 target + keydown focus 회복용.
  // callback ref + useState 로 mount 후 자동 re-render 트리거.
  const [stageWrap, setStageWrap] = useState<HTMLDivElement | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  const dragLeaderIdRef = useRef<string | null>(null);
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);

  const { bgImage, stageScale: fitScale } = useEditorImages(containerRef);
  useEditorDrag(stageRef);

  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const fontSize = useEditorStore((s) => s.fontSize);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const nextStepNum = useEditorStore((s) => s.nextStepNum);
  const incrementStepNum = useEditorStore((s) => s.incrementStepNum);
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);
  const textAlign = useEditorStore((s) => s.textAlign);
  const lineHeight = useEditorStore((s) => s.lineHeight);
  const shapes = useEditorStore((s) => s.shapes);
  const drawing = useEditorStore((s) => s.drawing);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const marquee = useEditorStore((s) => s.marquee);
  const startDrawing = useEditorStore((s) => s.startDrawing);
  const updateDrawing = useEditorStore((s) => s.updateDrawing);
  const finishDrawing = useEditorStore((s) => s.finishDrawing);
  const cancelDrawing = useEditorStore((s) => s.cancelDrawing);
  const selectShape = useEditorStore((s) => s.selectShape);
  const selectShapes = useEditorStore((s) => s.selectShapes);
  const setMarquee = useEditorStore((s) => s.setMarquee);
  const updateShape = useEditorStore((s) => s.updateShape);
  const deleteShape = useEditorStore((s) => s.deleteShape);
  const reorderShape = useEditorStore((s) => s.reorderShape);
  const editingId = useEditorStore((s) => s.editingId);
  const setEditingId = useEditorStore((s) => s.setEditingId);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);

  // 사용자 줌 — fit 스케일 × zoom. 작은 캡처를 돋보기처럼 확대해서 어노테이션.
  // 캔버스 메모리 폭주 방지로 Stage 한 변이 MAX_STAGE_PX 를 넘지 않게 상한.
  const stageScale = Math.min(
    fitScale * zoom,
    MAX_STAGE_PX / Math.max(imageWidth, imageHeight, 1),
  );
  // toDataURL pixelRatio 보정 — stageScale 과 무관하게 항상 원본 물리 픽셀
  // (devicePixelRatio × 논리 픽셀) 해상도로 export 한다 (줌 상태도 무관).
  const exportPixelRatio = window.devicePixelRatio / stageScale;
  useEditorKeyboard(stageRef, exportPixelRatio);

  // marquee 드래그 중인지 추적 — pointermove 에서 marquee 갱신, pointerup 에서
  // hit 판정 후 selectedIds set. ref 로 두어 재렌더 안 일으킴.
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);

  // bgImage 마운트 후 stage-wrap 에 자동 focus — 처음 캡처 뜬 직후 단축키 즉시 동작.
  useEffect(() => {
    if (bgImage && stageWrap) {
      stageWrap.focus();
    }
  }, [bgImage, stageWrap]);

  // 컨텍스트 메뉴 — 외부 클릭 시 닫기.
  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = (): void => setContextMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [contextMenu]);

  // 줌 앵커 — 휠 줌 직전 포인터 아래 이미지 좌표를 기록해 두고, 새 stageScale 이
  // DOM 에 반영된 직후(useLayoutEffect) 같은 화면 위치에 오도록 스크롤을 보정한다.
  const zoomAnchorRef = useRef<{
    imgX: number;
    imgY: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  // 트랙패드 핀치(Chromium 에서 ctrlKey=true 인 wheel) / ⌘+휠 → 줌.
  // 일반 두 손가락 스크롤은 컨테이너 스크롤(패닝)에 그대로 쓴다.
  // React onWheel 은 passive 등록이라 preventDefault 가 무시될 수 있어 native 등록.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !stageWrap) return undefined;
    const onWheel = (ev: WheelEvent): void => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const wrapRect = stageWrap.getBoundingClientRect();
      zoomAnchorRef.current = {
        imgX: (ev.clientX - wrapRect.left) / stageScale,
        imgY: (ev.clientY - wrapRect.top) / stageScale,
        clientX: ev.clientX,
        clientY: ev.clientY,
      };
      // exp 스케일 — deltaY 크기에 비례한 부드러운 줌 (핀치·휠 모두 자연스럽다).
      setZoom(zoom * Math.exp(-ev.deltaY * 0.01));
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [stageWrap, stageScale, zoom, setZoom]);

  // 줌 반영 직후 스크롤 보정 — 앵커의 이미지 좌표가 포인터 위치에 머물게 한다.
  // useLayoutEffect: 브라우저 paint 전에 스크롤을 맞춰야 한 프레임 튐이 없다.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const container = containerRef.current;
    if (!anchor || !container || !stageWrap) return;
    zoomAnchorRef.current = null;
    const wrapRect = stageWrap.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    // 스크롤 콘텐츠 안에서 stage-wrap 의 고정 오프셋 (margin 포함).
    const wrapLeft = wrapRect.left - containerRect.left + container.scrollLeft;
    const wrapTop = wrapRect.top - containerRect.top + container.scrollTop;
    container.scrollLeft =
      wrapLeft + anchor.imgX * stageScale - (anchor.clientX - containerRect.left);
    container.scrollTop =
      wrapTop + anchor.imgY * stageScale - (anchor.clientY - containerRect.top);
  }, [stageScale, stageWrap]);

  // 어떤 mouseup 이든 끝난 직후 stage-wrap 에 focus 회복.
  // (단 textarea 편집 중, 혹은 toolbar 내 포커서블 요소(<select>/<input> 등) 에
  //  포커스가 있을 때는 건너뜀 — macOS Electron native <select> 팝업이 focus 탈취로
  //  닫히는 버그 방지.)
  useEffect(() => {
    if (!stageWrap) return undefined;
    const onUp = (): void => {
      if (useEditorStore.getState().editingId !== null) return;
      if (document.activeElement === stageWrap) return;
      // toolbar 안의 포커서블 요소(<select>, <input type="color"> 등) 에 포커스가
      // 있으면 가져오지 않는다 — native select 팝업이 살아있는 동안 focus 를 빼앗으면
      // 팝업이 강제로 닫힌다.
      if ((document.activeElement as Element | null)?.closest?.('.toolbar')) return;
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

    if (tool === 'eraser') {
      // Group(step 등) 내부 자식 클릭 시 e.target.id()는 빈 문자열 — 부모 Group id 로 fallback.
      const targetId = e.target.id() || (e.target.getParent()?.id() ?? '');
      if (targetId) deleteShape(targetId);
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
    } else if (tool === 'line') {
      const newShape: LineShape = {
        kind: 'line',
        id,
        points: [x, y, x, y],
        stroke: color,
        strokeWidth,
      };
      startDrawing(newShape);
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
    } else if (tool === 'mosaic') {
      startDrawing({
        kind: 'mosaic',
        id,
        x,
        y,
        w: 0,
        h: 0,
        blockSize: useEditorStore.getState().mosaicBlockSize,
      });
    } else if (tool === 'text') {
      console.info(`[asis editor] text 도구 클릭 x=${x.toFixed(0)} y=${y.toFixed(0)} id=${id}`);
      const newShape: TextShape = {
        kind: 'text',
        id,
        x,
        y,
        // 기본 200px. 이미지 오른쪽 경계를 넘지 않도록 min, 너무 좁으면 40px 최소.
        width: Math.min(200, Math.max(40, imageWidth - x)),
        text: '',
        fill: color,
        fontSize,
        fontFamily,
        align: textAlign,
        lineHeight,
      };
      startDrawing(newShape);
      finishDrawing();
      selectShape(id);
      // KText 노드가 commit 후 mount 되어 ref 가 채워질 시간이 필요해서 next tick.
      window.requestAnimationFrame(() => {
        setEditingId(id);
      });
      console.info(`[asis editor] text 도형 추가 + editingId 예약 id=${id}`);
    } else if (tool === 'step') {
      const newShape: StepShape = {
        kind: 'step',
        id,
        x,
        y,
        num: nextStepNum,
        fill: color,
        fontSize,
      };
      startDrawing(newShape);
      finishDrawing();
      selectShape(id);
      incrementStepNum();
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
        case 'arrow':
        case 'line': {
          const [x1, y1] = shape.points;
          return { ...shape, points: [x1, y1, x, y] };
        }
        case 'pen':
          return { ...shape, points: [...shape.points, x, y] };
        case 'highlight':
          return { ...shape, w: x - shape.x, h: y - shape.y };
        case 'blur':
          return { ...shape, w: x - shape.x, h: y - shape.y };
        case 'mosaic':
          return { ...shape, w: x - shape.x, h: y - shape.y };
        case 'text':
        case 'step':
        case 'image':
          // image/step 은 mouse drag 로 그리지 않음.
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
        case 'mosaic':
          return Math.abs(drawing.w) < 4 || Math.abs(drawing.h) < 4;
        case 'ellipse':
          return Math.abs(drawing.rx) < 4 || Math.abs(drawing.ry) < 4;
        case 'arrow':
        case 'line':
        case 'pen': {
          const pts = drawing.points;
          if (pts.length < 4) return true;
          const dx = pts[pts.length - 2] - pts[0];
          const dy = pts[pts.length - 1] - pts[1];
          return dx * dx + dy * dy < 16;
        }
        case 'text':
        case 'step':
        case 'image':
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
    copyToClipboard(stageRef.current, exportPixelRatio);
  };

  const onCancelClick = (): void => {
    cancelEditor();
  };

  const onSaveFolderClick = (): void => {
    const stage = stageRef.current;
    if (!stage) {
      console.error('[asis editor] saveFolder: stage null');
      return;
    }
    const dataUrl = stageToDataUrl(stage, exportPixelRatio);
    window.editor.saveFolder(dataUrl).then(
      (result) => {
        console.info(`[asis editor] 폴더 저장 완료: ${result.path}`);
        setSaveToast(result.path);
        setTimeout(() => setSaveToast(null), 2500);
      },
      (err: unknown) => console.error('[asis editor] saveFolder 실패', err),
    );
  };

  const onPinClick = (): void => {
    const stage = stageRef.current;
    if (!stage) {
      console.error('[asis editor] pin: stage null');
      return;
    }
    const dataUrl = stageToDataUrl(stage, exportPixelRatio);
    // 핀 윈도우는 *원본 이미지 픽셀 크기* 그대로 — 큰 캡처면 큰 핀, 작은 캡처면 작은 핀.
    window.editor.pin(dataUrl, imageWidth, imageHeight).catch((err: unknown) => {
      console.error('[asis editor] pin 실패', err);
    });
  };

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
  // - 회전은 단일 + rect/ellipse/pen/image 만 (다중 회전 미구현).
  const singleSelected = selectedIds.length === 1
    ? (shapes.find((s) => s.id === selectedIds[0]) ?? null)
    : null;
  // arrow/line 단일 선택은 Transformer 박스 변환 대신 끝점 핸들 2개로 조작한다.
  // (선분에 박스 스케일을 적용하면 얇은 축에서 음수/0 scale 이 나와 좌표가 날뛴다.)
  const lineLikeSelected = singleSelected &&
    (singleSelected.kind === 'arrow' || singleSelected.kind === 'line')
    ? singleSelected
    : null;
  const canRotate = !!singleSelected && (
    singleSelected.kind === 'rect' ||
    singleSelected.kind === 'ellipse' ||
    singleSelected.kind === 'pen' ||
    singleSelected.kind === 'image'
  );
  const canResize = true;
  // 텍스트 박스도 8방향 모두 허용. onTransform 에서 scaleY=1 고정이므로
  // 상하/코너 드래그는 너비(scaleX)만 반영, 폰트 크기는 불변.
  const enabledAnchors = undefined;

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
      {saveToast !== null && (
        <div className="editor__toast">
          ✓ 저장됨 — {saveToast}
        </div>
      )}
      {contextMenu !== null && createPortal(
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e): void => e.stopPropagation()}
        >
          <button type="button" className="context-menu__item" onClick={(): void => {
            reorderShape(contextMenu.shapeId, 'front');
            setContextMenu(null);
          }}>맨 앞으로</button>
          <button type="button" className="context-menu__item" onClick={(): void => {
            reorderShape(contextMenu.shapeId, 'forward');
            setContextMenu(null);
          }}>앞으로</button>
          <button type="button" className="context-menu__item" onClick={(): void => {
            reorderShape(contextMenu.shapeId, 'backward');
            setContextMenu(null);
          }}>뒤로</button>
          <button type="button" className="context-menu__item" onClick={(): void => {
            reorderShape(contextMenu.shapeId, 'back');
            setContextMenu(null);
          }}>맨 뒤로</button>
        </div>,
        document.body,
      )}
      <div className="editor__canvas" ref={containerRef}>
        {bgImage && imageWidth > 0 && imageHeight > 0 ? (
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
            onMouseDown={(): void => {
              // 항상 focus 를 stageWrap 으로 가져온다.
              // 텍스트 편집 중이면 textarea.blur 가 발생 → TextEditor.handleBlur → commit.
              // 편집 중이 아니면 keydown 단축키가 stageWrap 에서 잡히도록 focus 유지.
              stageWrap?.focus();
            }}
            onDragOver={(e): void => {
              // OS 가 파일을 새 탭에서 열어버리지 않도록 default 막기.
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e): void => {
              e.preventDefault();
              const file = Array.from(e.dataTransfer.files).find((f) =>
                f.type.startsWith('image/'),
              );
              if (!file) return;
              // drop 위치를 stage 좌표로 변환.
              const rect = e.currentTarget.getBoundingClientRect();
              const dropX = (e.clientX - rect.left) / stageScale;
              const dropY = (e.clientY - rect.top) / stageScale;
              addImageFromSource(file, { x: dropX, y: dropY }).catch(
                (err: unknown) => console.error('[asis editor] drop 실패', err),
              );
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
              onContextMenu={(e): void => { e.evt.preventDefault(); }}
              style={{
                cursor: tool === 'select' ? 'default' : tool === 'eraser' ? CURSOR_ERASER : 'crosshair',
                // 텍스트 편집 중 canvas 가 pointer 이벤트를 먹으면 textarea 내부
                // 마우스 드래그 텍스트 선택이 중단된다. 편집 중엔 canvas 를 투과.
                pointerEvents: editingText ? 'none' : undefined,
              }}
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
                      // startPos 를 앵커로 넘겨 기존 `startPos + delta` 동작 보존.
                      // shapeDeltaPatch 로 leader 드래그(useEditorDrag)와 동일 로직 공유
                      // — 기존에 여기서 누락됐던 line 도형도 함께 처리된다.
                      selectedIds.forEach((sid) => {
                        const sh = allShapes.find((s) => s.id === sid);
                        const startPos = positions.get(sid);
                        if (!sh || !startPos) return;
                        updateShape(sid, shapeDeltaPatch(sh, dx, dy, startPos));
                      });
                      // arrow/line/pen 노드 position reset.
                      const stage = stageRef.current;
                      if (stage) {
                        selectedIds.forEach((sid) => {
                          const sh = allShapes.find((s) => s.id === sid);
                          const node = stage.findOne(`#${sid}`);
                          if (!node || !sh) return;
                          if (sh.kind === 'arrow' || sh.kind === 'line' || sh.kind === 'pen') {
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
                      // 그리기 도구가 활성화된 상태에서는 기존 도형을 선택하지 않는다.
                      // 클릭이 Stage onPointerDown 으로 전파되어 새 도형 그리기를 시작하도록 둔다.
                      if (tool !== 'select') return;
                      selectShape(s.id, evt.evt.shiftKey);
                    }}
                    onContextMenu={(e: Konva.KonvaEventObject<MouseEvent>): void => {
                      e.evt.preventDefault();
                      selectShape(s.id);
                      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, shapeId: s.id });
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
                {tool === 'select' && !lineLikeSelected ? (
                  <Transformer
                    ref={transformerRef}
                    rotateEnabled={canRotate}
                    resizeEnabled={canResize}
                    enabledAnchors={enabledAnchors}
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
                {tool === 'select' && lineLikeSelected ? (
                  <EndpointHandles
                    shape={lineLikeSelected}
                    stageScale={stageScale}
                    cursor={CURSOR_ROTATE}
                    restoreCursor="default"
                  />
                ) : null}
              </Layer>
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
        ) : (
          <div className="editor__empty">캡처를 불러오는 중…</div>
        )}
      </div>

      <Toolbar
        onCopy={onCopyClick}
        onCancel={onCancelClick}
        onPin={onPinClick}
        onSaveFolder={onSaveFolderClick}
        onImageFiles={(files): void => {
          Array.from(files)
            .filter((f) => f.type.startsWith('image/'))
            .forEach((f) => {
              addImageFromSource(f).catch((err: unknown) =>
                console.error('[asis editor] picker 실패', err),
              );
            });
        }}
      />
    </div>
  );
}

