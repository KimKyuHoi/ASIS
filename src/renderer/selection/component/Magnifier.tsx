import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { Point } from '../types/selection';
import { rgbToHex } from '../lib/color-utils';

/**
 * Magnifier — 마우스 포인터 주변 픽셀 확대 + 중앙 픽셀의 RGB/HEX 표시.
 * hex 영역 클릭 시 클립보드에 복사, 잠깐 "복사됨" 표시.
 * 화면 가장자리/방향에 따라 자동 위치 (포인터 우상단·좌상단 등).
 */
export function Magnifier({
  pointer,
  bgCanvas,
}: {
  pointer: Point;
  bgCanvas: HTMLCanvasElement;
}): JSX.Element | null {
  const [hex, setHex] = useState<string>('#000000');
  const [sampleCanvas, setSampleCanvas] = useState<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 매 pointer 변화 시 중심 픽셀 색 + 주변 영역 zoom 갱신.
  // raf 로 한 frame 미루어 set-state-in-effect 룰 회피.
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
      ctx.drawImage(
        bgCanvas,
        sx,
        sy,
        SAMPLE * dpr,
        SAMPLE * dpr,
        0,
        0,
        SIZE,
        SIZE,
      );
      const px = ctx.getImageData(SIZE / 2, SIZE / 2, 1, 1).data;
      setHex(rgbToHex(px[0], px[1], px[2]));
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [pointer, bgCanvas, sampleCanvas]);

  function handleCopy(): void {
    navigator.clipboard.writeText(hex.toUpperCase()).catch(() => {
      // selectionOverlay 창에서 클립보드 권한 실패 시 무음 처리
    });
    setCopied(true);
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 1200);
  }

  // 화면 가장자리 회피 — 포인터 우하단 기본, 모서리 가까우면 반대쪽.
  const offset = 20;
  const size = 96;
  const placeRight = pointer.x + offset + size + 8 < window.innerWidth;
  const placeBelow = pointer.y + offset + size + 32 < window.innerHeight;
  const left = placeRight ? pointer.x + offset : pointer.x - offset - size;
  const top = placeBelow ? pointer.y + offset : pointer.y - offset - size - 26;

  return (
    <div className="magnifier" style={{ left, top }}>
      <canvas
        ref={setSampleCanvas}
        className="magnifier__canvas"
        width={96}
        height={96}
      />
      <div className="magnifier__crosshair" aria-hidden="true">
        <span className="magnifier__cross magnifier__cross--h" />
        <span className="magnifier__cross magnifier__cross--v" />
      </div>
      <div
        className="magnifier__color magnifier__color--clickable"
        role="button"
        tabIndex={-1}
        title="클릭해서 복사"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={handleCopy}
      >
        <span
          className="magnifier__swatch"
          style={{ background: hex }}
          aria-hidden="true"
        />
        <span className="magnifier__hex">
          {copied ? '복사됨 ✓' : hex.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

