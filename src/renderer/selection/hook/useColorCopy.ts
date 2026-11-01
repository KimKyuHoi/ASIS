import { useEffect, useRef, useState } from 'react';
import type { Point } from '../types/selection';
import { rgbToHex } from '../lib/color-utils';

/** 복사 성공 토스트 표시 시간. */
const TOAST_DURATION_MS = 1400;

/**
 * 우클릭 색상 복사 — 커서 아래 픽셀의 HEX 를 클립보드에 넣고 토스트로 알린다.
 * copyToast 는 복사된 HEX 문자열, 표시 중이 아니면 null.
 */
export function useColorCopy(): {
  copyToast: string | null;
  copyColorAt: (canvas: HTMLCanvasElement | null, point: Point) => void;
} {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 언마운트 시 대기 중인 토스트 타이머 정리.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (hex: string): void => {
    setCopyToast(hex);
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setCopyToast(null), TOAST_DURATION_MS);
  };

  const copyColorAt = (canvas: HTMLCanvasElement | null, point: Point): void => {
    // background 가 아직 없으면(canvas 미마운트·2d 컨텍스트 없음) 복사할 픽셀이 없다.
    const ctx = canvas?.getContext('2d') ?? null;
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const px = ctx.getImageData(Math.round(point.x * dpr), Math.round(point.y * dpr), 1, 1).data;
    const hex = rgbToHex(px[0], px[1], px[2]).toUpperCase();
    window.selection.copyText(hex).then(() => showToast(hex)).catch((err: unknown) => {
      console.error('[asis overlay] 색상 복사 실패', err);
    });
  };

  return { copyToast, copyColorAt };
}
