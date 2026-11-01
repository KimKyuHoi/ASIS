import { useEffect, useState, type JSX } from 'react';
import type { Point } from '../types/selection';
import { rgbToHex } from '../lib/color-utils';

/** 돋보기 캔버스 한 변(CSS px) · 확대 배율 — 한 변에 SIZE/ZOOM 픽셀을 샘플링한다. */
const SIZE = 96;
const ZOOM = 8;
const SAMPLE = SIZE / ZOOM;
/** 커서와 돋보기 사이 간격. */
const OFFSET = 20;
/** 화면 오른쪽 가장자리 여유. */
const EDGE_MARGIN = 8;
/** 캔버스 아래 색상 행 높이 — 위/아래 배치 판정에 포함한다. */
const COLOR_ROW_HEIGHT = 38;

/** 화면 밖으로 나가지 않도록 커서 우하단을 기본으로, 공간이 없으면 좌/상으로 뒤집는다. */
function magnifierPosition(pointer: Point): { left: number; top: number } {
  const placeRight = pointer.x + OFFSET + SIZE + EDGE_MARGIN < window.innerWidth;
  const placeBelow = pointer.y + OFFSET + SIZE + COLOR_ROW_HEIGHT < window.innerHeight;
  return {
    left: placeRight ? pointer.x + OFFSET : pointer.x - OFFSET - SIZE,
    top: placeBelow ? pointer.y + OFFSET : pointer.y - OFFSET - SIZE - COLOR_ROW_HEIGHT,
  };
}

/**
 * Magnifier — 마우스 포인터 주변 픽셀 확대 + 중앙 픽셀의 HEX 색상 표시.
 * 화면 가장자리/방향에 따라 자동 위치 (포인터 우하단·좌하단 등).
 *
 * 표시 전용이다(pointer-events: none). 돋보기는 커서에서 떨어져 따라다니므로
 * 직접 클릭이 불가능 — 색상 복사는 오버레이의 우클릭이 담당한다(SelectionOverlay).
 */
export function Magnifier({
  pointer,
  bgCanvas,
}: {
  pointer: Point;
  bgCanvas: HTMLCanvasElement;
}): JSX.Element | null {
  const [rgb, setRgb] = useState<[number, number, number]>([0, 0, 0]);
  const [sampleCanvas, setSampleCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!sampleCanvas) return undefined;
    let cancelled = false;
    const id = window.requestAnimationFrame(() => {
      if (cancelled) return;
      const ctx = sampleCanvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      const dpr = window.devicePixelRatio || 1;
      const sx = pointer.x * dpr - (SAMPLE * dpr) / 2;
      const sy = pointer.y * dpr - (SAMPLE * dpr) / 2;
      ctx.drawImage(bgCanvas, sx, sy, SAMPLE * dpr, SAMPLE * dpr, 0, 0, SIZE, SIZE);
      const px = ctx.getImageData(SIZE / 2, SIZE / 2, 1, 1).data;
      setRgb([px[0], px[1], px[2]]);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [pointer, bgCanvas, sampleCanvas]);

  const hex = rgbToHex(rgb[0], rgb[1], rgb[2]).toUpperCase();

  return (
    <div className="magnifier" style={magnifierPosition(pointer)}>
      <canvas ref={setSampleCanvas} className="magnifier__canvas" width={SIZE} height={SIZE} />
      <div className="magnifier__crosshair" aria-hidden="true">
        <span className="magnifier__cross magnifier__cross--h" />
        <span className="magnifier__cross magnifier__cross--v" />
      </div>
      <div className="magnifier__color">
        <span className="magnifier__swatch" style={{ background: hex }} aria-hidden="true" />
        <span className="magnifier__value">{hex}</span>
      </div>
    </div>
  );
}
