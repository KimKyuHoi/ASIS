import type { BaseImage } from '../types/crop';
import type {
  CropActionKey,
  EditorData,
  EditorStore,
  GetState,
  HistoryActionKey,
  SetState,
} from './store';
import { translateShape } from './shape-translate';

/**
 * 에디터 store 의 기록(undo/redo)·크롭 액션 — store.ts 가 길어져 분리했다.
 * store.ts 와는 타입만 주고받는다 (런타임 순환 import 없음).
 */

/**
 * 도형 편집 한 건의 기록 갱신 — 직전 shapes 를 past 에, future 와 크롭 redo 표식은 비운다.
 * 크롭 redo 표식을 남겨 두면 이후 undo 로 past 길이가 우연히 같아질 때 엉뚱한 이미지로 바뀐다.
 */
export function pushHistory(s: EditorData): Pick<EditorData, 'past' | 'future' | 'cropRedo'> {
  return { past: [...s.past, s.shapes], future: [], cropRedo: [] };
}

/** 크롭 모드 진입·영역 지정·취소·적용. */
export function cropActions(set: SetState): Pick<EditorStore, CropActionKey> {
  return {
    startCrop: () => set({
      cropping: true,
      cropRect: null,
      tool: 'select',
      selectedIds: [],
      marquee: null,
      drawing: null,
    }),
    setCropRect: (rect) => set({ cropRect: rect }),
    cancelCrop: () => set({ cropping: false, cropRect: null }),
    applyCrop: (image, offset) => set((s) => {
      if (s.imageSrc === null) throw new Error('applyCrop: 배경 이미지가 없다');
      const previous: BaseImage = { src: s.imageSrc, width: s.imageWidth, height: s.imageHeight };
      const history = pushHistory(s);
      return {
        ...imagePatch(image),
        shapes: s.shapes.map((sh) => translateShape(sh, -offset.x, -offset.y)),
        ...history,
        cropUndo: [...s.cropUndo, { at: history.past.length, image: previous }],
        cropping: false,
        cropRect: null,
        selectedIds: [],
        editingId: null,
        zoom: 1,
      };
    }),
  };
}

/** 지금 배경 이미지 — undo/redo 가 크롭 표식과 맞바꿀 때 쓴다. */
function currentImage(s: EditorData): BaseImage {
  if (s.imageSrc === null) throw new Error('크롭 undo/redo: 배경 이미지가 없다');
  return { src: s.imageSrc, width: s.imageWidth, height: s.imageHeight };
}

/** 배경을 image 로 바꾸는 패치. */
function imagePatch(image: BaseImage): Pick<EditorData, 'imageSrc' | 'imageWidth' | 'imageHeight'> {
  return { imageSrc: image.src, imageWidth: image.width, imageHeight: image.height };
}

/**
 * undo/redo — past / present(=shapes) / future.
 * 되돌리는 칸이 크롭 적용이었으면(past 길이가 표식 at 과 같으면) 배경 이미지도 맞바꾼다.
 */
export function historyActions(set: SetState, get: GetState): Pick<EditorStore, HistoryActionKey> {
  return {
    undo: () => set((s) => {
      if (s.past.length === 0) return {};
      const previous = s.past[s.past.length - 1];
      const base = {
        shapes: previous,
        past: s.past.slice(0, -1),
        future: [s.shapes, ...s.future],
        selectedIds: [],
        drawing: null,
        cropping: false,
        cropRect: null,
      };
      const mark = s.cropUndo.at(-1);
      // 표식이 없거나 이 칸이 아니면 도형만 되돌린다 (gif-studio·step-guide 는 표식이 늘 비어 있다).
      if (mark?.at !== s.past.length) return base;
      return {
        ...base,
        ...imagePatch(mark.image),
        cropUndo: s.cropUndo.slice(0, -1),
        cropRedo: [...s.cropRedo, { at: s.past.length, image: currentImage(s) }],
        zoom: 1,
      };
    }),
    redo: () => set((s) => {
      if (s.future.length === 0) return {};
      const next = s.future[0];
      const base = {
        shapes: next,
        past: [...s.past, s.shapes],
        future: s.future.slice(1),
        selectedIds: [],
        drawing: null,
        cropping: false,
        cropRect: null,
      };
      const mark = s.cropRedo.at(-1);
      if (mark?.at !== base.past.length) return base;
      return {
        ...base,
        ...imagePatch(mark.image),
        cropRedo: s.cropRedo.slice(0, -1),
        cropUndo: [...s.cropUndo, { at: base.past.length, image: currentImage(s) }],
        zoom: 1,
      };
    }),
    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
  };
}
