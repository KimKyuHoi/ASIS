import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { Point } from '../types/selection';
import { rgbToHex } from '../lib/color-utils';

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
      const ZOOM = 8;
      const SIZE = 96;
      const SAMPLE = SIZE / ZOOM;
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

  const offset = 20;
  const size = 96;
  const placeRight = pointer.x + offset + size + 8 < window.innerWidth;
  const placeBelow = pointer.y + offset + size + 38 < window.innerHeight;
  const left = placeRight ? pointer.x + offset : pointer.x - offset - size;
  const top = placeBelow ? pointer.y + offset : pointer.y - offset - size - 38;

  return (
    <div className="magnifier" style={{ left, top }}>
      <canvas ref={setSampleCanvas} className="magnifier__canvas" width={96} height={96} />
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
