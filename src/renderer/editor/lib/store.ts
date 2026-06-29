import { create } from 'zustand';
import type { DashStyle, Shape, StrokeWidth, TextAlign, Tool } from '../types/shapes';

/**
 * 어노테이션 에디터 단일 zustand 스토어.
 *
 * .claude/rules/side-effects.md 의 *"Class 가 짐이 되는 경우"* 정신 부합:
 *   인스턴스의 동작이 props/state 조합으로 결정되는 흐름이라, Class 보다
 *   *zustand state + 함수형 업데이터* 가 솔직하다 (사용자분 갱신 룰 직인용).
 *
 * 도형 데이터·도구 상태·undo/redo 모두 여기에 살고, react-konva 가 그걸
 * 함수형으로 렌더한다. Class 패턴은 main process 의 EditorWindowManager
 * 한 군데에만 (외부 BrowserWindow lifecycle 분리).
 *
 * History: past[] / present(=shapes) / future[] 패턴.
 *  - 도형 추가/수정/삭제 시 past 에 *직전 shapes* push, future 비움
 *  - undo: past 마지막 → present, present → future 앞쪽
 *  - redo: future 첫 → present, present → past 끝
 */

export const PALETTE = [
  '#ff3b30', // red
  '#ff6b6b', // light red
  '#ff9500', // orange
  '#ffcc00', // yellow
  '#34c759', // green
  '#00c7be', // teal
  '#007aff', // blue
  '#5856d6', // indigo
  '#af52de', // purple
  '#000000', // black
  '#8e8e93', // gray
  '#ffffff', // white
] as const;

export const STROKE_WIDTHS: readonly StrokeWidth[] = [1, 2, 4, 6, 10, 16];

export const BLUR_RADII: readonly number[] = [4, 8, 12, 16, 24, 32];

export const MOSAIC_BLOCK_SIZES: readonly number[] = [5, 10, 15, 20, 30];

export const FONT_SIZES: readonly number[] = [12, 16, 20, 24, 32, 48, 64];

export const LINE_HEIGHTS: readonly number[] = [1.0, 1.2, 1.5, 2.0];

export const FONT_FAMILIES: readonly { label: string; value: string }[] = [
  { label: 'Pretendard', value: 'Pretendard, -apple-system, BlinkMacSystemFont, sans-serif' },
  { label: 'Apple SD Gothic', value: '"Apple SD Gothic Neo", sans-serif' },
  { label: 'Helvetica', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet', value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Palatino', value: 'Palatino, "Book Antiqua", serif' },
  { label: 'Mono', value: '"Courier New", Courier, monospace' },
  { label: 'Impact', value: 'Impact, "Arial Black", sans-serif' },
  { label: 'Futura', value: 'Futura, "Century Gothic", sans-serif' },
  { label: 'Optima', value: 'Optima, Candara, sans-serif' },
  { label: 'Gill Sans', value: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' },
];

export const DEFAULT_FONT_FAMILY = FONT_FAMILIES[0].value;

// 줌 배율 범위 — 1 미만(fit 이하 축소)은 허용하지 않는다. 작은 캡처 확대가 목적.
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;

type EditorStore = {
  // 도구·스타일
  tool: Tool;
  color: string;
  strokeWidth: StrokeWidth;
  /** 선 스타일 — 새로 그리는 stroked 도형의 기본값. 기본 'solid'(실선). */
  dash: DashStyle;
  blurRadius: number;
  mosaicBlockSize: number;
  fontSize: number;
  fontFamily: string;
  textAlign: TextAlign;
  lineHeight: number;
  nextStepNum: number;

  // 캔버스
  imageSrc: string | null;
  imageWidth: number;
  imageHeight: number;
  /** 사용자 줌 배율 — fit 스케일에 곱해 stageScale 이 된다. ZOOM_MIN~MAX clamp. */
  zoom: number;
  /**
   * 실제 화면에 적용된 배율 = stageScale / fitScale.
   * 보통 zoom 과 같지만, 큰 이미지에서 stageScale 이 메모리 상한(MAX_STAGE_PX)에
   * 걸리면 zoom 보다 작아진다. 선·점선 두께의 줌 보정은 이 값을 기준으로 해야
   * 상한 clamp 상황에서도 화면상 두께가 일정하게 유지된다 (zoom 기준이면 어긋남).
   * Editor 가 stageScale 변화에 맞춰 동기화한다.
   */
  effectiveZoom: number;

  // 도형
  shapes: Shape[];
  drawing: Shape | null;
  /** 다중 선택 — PPT 식 marquee + 단일 클릭 모두 이 array 에 모인다. */
  selectedIds: string[];
  /** 텍스트 인라인 편집 중인 도형 id (TextShape 한정) */
  editingId: string | null;
  /** marquee 박스 — select 도구 빈 영역 드래그로 영역 선택 시 임시 표시. */
  marquee: { x: number; y: number; w: number; h: number } | null;

  // history
  past: Shape[][];
  future: Shape[][];

  // 액션
  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (w: StrokeWidth) => void;
  setDash: (d: DashStyle) => void;
  setBlurRadius: (r: number) => void;
  setMosaicBlockSize: (s: number) => void;
  setFontSize: (s: number) => void;
  setFontFamily: (f: string) => void;
  setTextAlign: (a: TextAlign) => void;
  setLineHeight: (h: number) => void;
  setZoom: (z: number) => void;
  setEffectiveZoom: (z: number) => void;
  incrementStepNum: () => void;

  reorderShape: (id: string, dir: 'front' | 'forward' | 'backward' | 'back') => void;

  loadImage: (src: string, width: number, height: number) => void;

  startDrawing: (shape: Shape) => void;
  updateDrawing: (updater: (shape: Shape) => Shape) => void;
  finishDrawing: () => void;
  cancelDrawing: () => void;

  /**
   * 선택 갱신.
   * - id=null → 선택 해제 (additive 무시)
   * - id 단일 + additive=false → 단일 선택
   * - id 단일 + additive=true → 토글 (이미 있으면 제거, 없으면 추가)
   * - ids 배열 → 그대로 set (marquee 결과 반영)
   */
  selectShape: (id: string | null, additive?: boolean) => void;
  selectShapes: (ids: string[]) => void;
  setMarquee: (m: { x: number; y: number; w: number; h: number } | null) => void;
  updateShape: (id: string, patch: Partial<Shape>) => void;
  deleteShape: (id: string) => void;
  deleteSelected: () => void;
  pasteShapes: (shapes: Shape[]) => void;
  setEditingId: (id: string | null) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  tool: 'select',
  color: PALETTE[0],
  strokeWidth: 4,
  dash: 'solid',
  blurRadius: 16,
  mosaicBlockSize: 10,
  fontSize: 24,
  fontFamily: DEFAULT_FONT_FAMILY,
  textAlign: 'left',
  lineHeight: 1.2,
  nextStepNum: 1,

  imageSrc: null,
  imageWidth: 0,
  imageHeight: 0,
  zoom: 1,
  effectiveZoom: 1,

  shapes: [],
  drawing: null,
  selectedIds: [],
  editingId: null,
  marquee: null,

  past: [],
  future: [],

  setTool: (tool) => set({ tool, selectedIds: [], marquee: null }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (w) => set({ strokeWidth: w }),
  setDash: (d) => set({ dash: d }),
  setBlurRadius: (r) => set({ blurRadius: r }),
  setMosaicBlockSize: (s) => set({ mosaicBlockSize: s }),
  setFontSize: (s) => set({ fontSize: s }),
  setFontFamily: (f) => set({ fontFamily: f }),
  setTextAlign: (a) => set({ textAlign: a }),
  setLineHeight: (h) => set({ lineHeight: h }),
  setZoom: (z) => set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) }),
  setEffectiveZoom: (z) => set({ effectiveZoom: z }),
  incrementStepNum: () => set((s) => ({ nextStepNum: s.nextStepNum + 1 })),

  reorderShape: (id, dir) => set((s) => {
    const idx = s.shapes.findIndex((sh) => sh.id === id);
    if (idx < 0) return {};
    const arr = [...s.shapes];
    const [item] = arr.splice(idx, 1);
    let newIdx: number;
    if (dir === 'front') newIdx = arr.length;
    else if (dir === 'back') newIdx = 0;
    else if (dir === 'forward') newIdx = Math.min(idx + 1, arr.length);
    else newIdx = Math.max(idx - 1, 0);
    if (newIdx === idx && dir !== 'front' && dir !== 'back') return {};
    arr.splice(newIdx, 0, item);
    return { shapes: arr, past: [...s.past, s.shapes], future: [] };
  }),

  loadImage: (src, width, height) => set({
    imageSrc: src,
    imageWidth: width,
    imageHeight: height,
    shapes: [],
    drawing: null,
    selectedIds: [],
    editingId: null,
    marquee: null,
    past: [],
    future: [],
    nextStepNum: 1,
  }),

  startDrawing: (shape) => set({ drawing: shape }),

  updateDrawing: (updater) => set((s) => {
    if (!s.drawing) return {};
    return { drawing: updater(s.drawing) };
  }),

  finishDrawing: () => set((s) => {
    if (!s.drawing) return {};
    return {
      shapes: [...s.shapes, s.drawing],
      drawing: null,
      past: [...s.past, s.shapes],
      future: [],
    };
  }),

  cancelDrawing: () => set({ drawing: null }),

  selectShape: (id, additive = false) => set((s) => {
    if (id === null) return { selectedIds: [] };
    if (!additive) return { selectedIds: [id] };
    // additive: 토글
    const has = s.selectedIds.includes(id);
    return {
      selectedIds: has
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    };
  }),

  selectShapes: (ids) => set({ selectedIds: ids }),

  setMarquee: (m) => set({ marquee: m }),

  updateShape: (id, patch) => set((s) => ({
    shapes: s.shapes.map((sh) =>
      sh.id === id ? ({ ...sh, ...patch } as Shape) : sh,
    ),
    past: [...s.past, s.shapes],
    future: [],
  })),

  deleteShape: (id) => set((s) => ({
    shapes: s.shapes.filter((sh) => sh.id !== id),
    selectedIds: s.selectedIds.filter((x) => x !== id),
    editingId: s.editingId === id ? null : s.editingId,
    past: [...s.past, s.shapes],
    future: [],
  })),

  deleteSelected: () => set((s) => {
    if (s.selectedIds.length === 0) return {};
    const idSet = new Set(s.selectedIds);
    return {
      shapes: s.shapes.filter((sh) => !idSet.has(sh.id)),
      selectedIds: [],
      editingId: null,
      past: [...s.past, s.shapes],
      future: [],
    };
  }),

  pasteShapes: (newShapes) => set((s) => ({
    shapes: [...s.shapes, ...newShapes],
    selectedIds: newShapes.map((sh) => sh.id),
    past: [...s.past, s.shapes],
    future: [],
  })),

  setEditingId: (id) => set({ editingId: id }),

  undo: () => set((s) => {
    if (s.past.length === 0) return {};
    const previous = s.past[s.past.length - 1];
    return {
      shapes: previous,
      past: s.past.slice(0, -1),
      future: [s.shapes, ...s.future],
      selectedIds: [],
      drawing: null,
    };
  }),

  redo: () => set((s) => {
    if (s.future.length === 0) return {};
    const next = s.future[0];
    return {
      shapes: next,
      past: [...s.past, s.shapes],
      future: s.future.slice(1),
      selectedIds: [],
      drawing: null,
    };
  }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

