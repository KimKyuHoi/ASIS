import { useEditorStore } from './store';
import { rememberDecoded, retainOnly } from './decoded-images';
import type { BaseImage, CropRect } from '../types/crop';

/**
 * 디코드 캐시 정리 — 배경이나 크롭 기록이 바뀔 때마다 기록이 가리키는 배경만 남긴다.
 * (크롭 → undo → 도형 편집으로 cropRedo 가 비면 그 순간 redo 용 이미지를 놓는다.)
 * store 는 순수하게 두고 모듈 스코프에서 한 번 구독한다 — 윈도우 수명 = 구독 수명(cleanup 불필요).
 * 크롭을 쓰지 않는 화면(gif-studio·step-guide)은 캐시가 늘 비어 있어 비용이 없다.
 */
useEditorStore.subscribe((next, prev) => {
  const changed = next.imageSrc !== prev.imageSrc ||
    next.cropUndo !== prev.cropUndo || next.cropRedo !== prev.cropRedo;
  if (!changed) return;
  const keep = new Set<string>();
  // 첫 로드 전(null)·GIF 스튜디오('')는 배경 data URL 이 없다 — 그때는 기록이 가리키는 것만.
  if (next.imageSrc) keep.add(next.imageSrc);
  for (const m of next.cropUndo) keep.add(m.image.src);
  for (const m of next.cropRedo) keep.add(m.image.src);
  retainOnly(keep);
});

/** 이보다 작은 영역(논리 px)은 크롭으로 치지 않는다 — 클릭 실수로 1px 이미지가 되는 것 방지. */
export const MIN_CROP = 4;

type Point = { x: number; y: number };

/** 두 점으로 만든 영역 (w·h 양수). */
export function rectFromPoints(a: Point, b: Point): CropRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

export function isUsableCrop(rect: CropRect | null): rect is CropRect {
  return rect !== null && rect.w >= MIN_CROP && rect.h >= MIN_CROP;
}

/** 영역을 이미지 [0, w]×[0, h] 안으로 자른다. */
export function clampCropRect(rect: CropRect, width: number, height: number): CropRect {
  const x = Math.min(Math.max(rect.x, 0), width);
  const y = Math.min(Math.max(rect.y, 0), height);
  return {
    x,
    y,
    w: Math.min(rect.x + rect.w, width) - x,
    h: Math.min(rect.y + rect.h, height) - y,
  };
}

type CropResult = { image: BaseImage; offset: Point };

/**
 * bgImage 의 rect 영역을 잘라 새 배경을 만든다.
 *
 * 경계는 *물리 픽셀* 에 맞춘다 — 논리 좌표를 그대로 쓰면 Retina 에서 반 픽셀 경계가 생겨
 * drawImage 가 보간(흐림)한다. 새 논리 크기 = 물리 픽셀 수 / 배율 이라 소수일 수 있는데,
 * 에디터는 원래 소수 논리 크기를 받는다(editorWindow loadCapture 주석).
 * 결과 offset 도 같은 물리 경계에서 환산해 도형 이동과 픽셀이 어긋나지 않게 한다.
 */
export function cropImage(
  bgImage: HTMLImageElement,
  rect: CropRect,
  logical: { width: number; height: number },
): CropResult {
  const rx = bgImage.naturalWidth / logical.width;
  const ry = bgImage.naturalHeight / logical.height;
  if (!(rx > 0) || !(ry > 0)) throw new Error(`cropImage: 잘못된 배율 ${String(rx)}×${String(ry)}`);
  const x0 = Math.min(Math.max(Math.round(rect.x * rx), 0), bgImage.naturalWidth - 1);
  const y0 = Math.min(Math.max(Math.round(rect.y * ry), 0), bgImage.naturalHeight - 1);
  const x1 = Math.min(Math.max(Math.round((rect.x + rect.w) * rx), x0 + 1), bgImage.naturalWidth);
  const y1 = Math.min(Math.max(Math.round((rect.y + rect.h) * ry), y0 + 1), bgImage.naturalHeight);
  const pw = x1 - x0;
  const ph = y1 - y0;
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('cropImage: 2d 컨텍스트를 만들지 못했다');
  ctx.drawImage(bgImage, x0, y0, pw, ph, 0, 0, pw, ph);
  return {
    image: { src: canvas.toDataURL('image/png'), width: pw / rx, height: ph / ry },
    offset: { x: x0 / rx, y: y0 / ry },
  };
}

/**
 * 크롭 모드의 영역을 적용한다 (Enter·적용 버튼).
 * 영역이 없거나 너무 작으면, 또는 이미지 전체면 바꿀 게 없으니 크롭 모드만 끝낸다.
 * 새 이미지를 미리 디코드해 캐시에 넣은 뒤 store 를 바꾼다 — decoded-images.ts 참고.
 */
export async function commitCrop(bgImage: HTMLImageElement): Promise<void> {
  const st = useEditorStore.getState();
  if (!st.cropping) return;
  const { imageSrc, imageWidth, imageHeight } = st;
  if (imageSrc === null) throw new Error('commitCrop: 배경 이미지가 없다');
  const rect = st.cropRect === null ? null : clampCropRect(st.cropRect, imageWidth, imageHeight);
  const whole = rect !== null && rect.w >= imageWidth && rect.h >= imageHeight;
  if (!isUsableCrop(rect) || whole) {
    st.cancelCrop();
    return;
  }
  const result = cropImage(bgImage, rect, { width: imageWidth, height: imageHeight });
  const next = new Image();
  next.src = result.image.src;
  await next.decode();
  // 디코드 동안 사용자가 크롭을 취소했거나 다른 이미지가 들어왔으면 버린다.
  const now = useEditorStore.getState();
  if (!now.cropping || now.imageSrc !== imageSrc) return;
  // undo 로 돌아갈 지금 이미지도 캐시에 — 되돌릴 때도 깜빡임 없이 바꿔 끼운다.
  rememberDecoded(imageSrc, bgImage);
  rememberDecoded(result.image.src, next);
  // 캐시 정리는 위 구독이 applyCrop 직후 한다.
  now.applyCrop(result.image, result.offset);
}
