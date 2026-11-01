import type { ShapeBackground } from '../types/background';

/**
 * 배경 이미지 + 도형 좌표계 폭 → ShapeBackground. 폭이 0 이하면(아직 로드 전 크기) 배율을
 * 정할 수 없다 — 그 상태로 블러를 그리면 엉뚱한 영역을 자르므로 throw.
 */
export function backgroundFor(image: HTMLImageElement, logicalWidth: number): ShapeBackground {
  if (!(logicalWidth > 0)) {
    throw new Error(`backgroundFor: 도형 좌표계 폭이 올바르지 않다 (${String(logicalWidth)})`);
  }
  return { image, pixelRatio: image.naturalWidth / logicalWidth };
}
