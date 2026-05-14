import { useEditorStore } from './store';
import type { ImageShape } from '../types/shapes';

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * 이미지 src 를 디코드 후 maxDim 보다 큰 변이 있으면 canvas 로 thumbnail resize.
 * undo 스택·복사용 dataURL 무거워지지 않도록 store 에 박기 전에 1회 거치는 게이트.
 */
export async function loadAndResize(
  src: string,
  maxDim: number,
): Promise<{ src: string; w: number; h: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = (): void => resolve(el);
    el.onerror = (): void => reject(new Error('이미지 디코드 실패'));
    el.src = src;
  });
  const longest = Math.max(img.width, img.height);
  if (longest <= maxDim) {
    return { src, w: img.width, h: img.height };
  }
  const scale = maxDim / longest;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('canvas 2d context 사용 불가 — 환경 검증 필요');
  }
  ctx.drawImage(img, 0, 0, w, h);
  return { src: canvas.toDataURL('image/png'), w, h };
}

/**
 * File / Blob / dataURL → ImageShape 추가 (모듈 함수).
 *
 * 컴포넌트 closure 의존 없음 — useEditorStore.getState() 로 최신 state 직접 read.
 * 호출처 (paste / drop / picker) 모두 같은 함수 사용.
 */
export async function addImageFromSource(
  source: Blob | string,
  hint?: { x: number; y: number },
): Promise<void> {
  const state = useEditorStore.getState();
  if (state.imageWidth === 0 || state.imageHeight === 0) return;
  const dataUrl = typeof source === 'string'
    ? source
    : await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (): void => resolve(String(reader.result));
      reader.onerror = (): void => reject(new Error('FileReader 실패'));
      reader.readAsDataURL(source);
    });
  const { src, w, h } = await loadAndResize(dataUrl, 2048);
  const maxOnCanvas = Math.min(state.imageWidth, state.imageHeight) * 0.6;
  const longestOnCanvas = Math.max(w, h);
  const fit = longestOnCanvas > maxOnCanvas ? maxOnCanvas / longestOnCanvas : 1;
  const dispW = w * fit;
  const dispH = h * fit;
  const center = hint ?? { x: state.imageWidth / 2, y: state.imageHeight / 2 };
  const id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const shape: ImageShape = {
    kind: 'image',
    id,
    x: clamp(center.x - dispW / 2, 0, state.imageWidth - dispW),
    y: clamp(center.y - dispH / 2, 0, state.imageHeight - dispH),
    w: dispW,
    h: dispH,
    src,
  };
  state.startDrawing(shape);
  state.finishDrawing();
  state.selectShape(id);
}
