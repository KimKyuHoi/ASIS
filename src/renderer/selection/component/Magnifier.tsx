import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { Point } from '../types/selection';
import { rgbToHex, rgbToHsl } from '../lib/color-utils';

type ColorFormat = 'hex' | 'rgb' | 'hsl';
const FORMATS: ColorFormat[] = ['hex', 'rgb', 'hsl'];

/**
 * Magnifier — 마우스 포인터 주변 픽셀 확대 + 중앙 픽셀의 색상 표시.
 * 하단 색상 바 클릭 시 HEX → RGB → HSL 순으로 포맷 전환 + 클립보드 복사.
 * 화면 가장자리/방향에 따라 자동 위치 (포인터 우하단·좌하단 등).
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
  const [format, setFormat] = useState<ColorFormat>('hex');
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 언마운트 시 대기 중인 "복사됨" 리셋 타이머 정리 — 사라진 컴포넌트에 setState 방지.
  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);

  function formatValue(fmt: ColorFormat): string {
    if (fmt === 'hex') return hex.toUpperCase();
    if (fmt === 'rgb') return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    return `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`;
  }

  function handleCopy(): void {
    const value = formatValue(format);
    navigator.clipboard.writeText(value).catch((err: unknown) => {
      // 클립보드 쓰기 실패 — 포커스 없음/권한 등. 치명적이지 않으므로 로깅만.
      console.error('[asis magnifier] 클립보드 복사 실패', err);
    });
    setCopied(true);
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 1000);
    // 복사 후 다음 포맷으로 전환
    setFormat((prev) => FORMATS[(FORMATS.indexOf(prev) + 1) % FORMATS.length]);
  }

  const offset = 20;
  const size = 96;
  const placeRight = pointer.x + offset + size + 8 < window.innerWidth;
  const placeBelow = pointer.y + offset + size + 38 < window.innerHeight;
  const left = placeRight ? pointer.x + offset : pointer.x - offset - size;
  const top = placeBelow ? pointer.y + offset : pointer.y - offset - size - 38;

  return (
    <div
      className="magnifier magnifier--clickable"
      style={{ left, top }}
      role="button"
      tabIndex={-1}
      title="클릭해서 복사 (HEX → RGB → HSL)"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={handleCopy}
    >
      <canvas ref={setSampleCanvas} className="magnifier__canvas" width={96} height={96} />
      <div className="magnifier__crosshair" aria-hidden="true">
        <span className="magnifier__cross magnifier__cross--h" />
        <span className="magnifier__cross magnifier__cross--v" />
      </div>
      <div className="magnifier__color">
        <span className="magnifier__swatch" style={{ background: hex }} aria-hidden="true" />
        <span className="magnifier__fmt">{format.toUpperCase()}</span>
        <span className="magnifier__hex">
          {copied ? '복사됨 ✓' : formatValue(format)}
        </span>
      </div>
    </div>
  );
}
