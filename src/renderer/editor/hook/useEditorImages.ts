import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { useEditorStore } from '../lib/store';

/**
 * 배경 이미지 로드 + Stage 스케일 계산.
 *
 * - imageSrc → HTMLImageElement 디코딩 → bgImage
 * - 컨테이너 리사이즈 → stageScale 재계산 (Retina / 축소 표시)
 */
export function useEditorImages(containerRef: RefObject<HTMLDivElement | null>): {
  bgImage: HTMLImageElement | null;
  stageScale: number;
} {
  const imageSrc = useEditorStore((s) => s.imageSrc);
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [stageScale, setStageScale] = useState(1);

  useEffect(() => {
    if (!imageSrc) return undefined;
    const img = new Image();
    img.src = imageSrc;
    let active = true;
    img.onload = (): void => {
      if (active) setBgImage(img);
    };
    img.onerror = (): void => {
      console.error('[asis] editor: image load failed', imageSrc);
    };
    return () => {
      active = false;
    };
  }, [imageSrc]);

  useEffect(() => {
    if (!imageWidth || !imageHeight) return undefined;
    const recompute = (): void => {
      const el = containerRef.current;
      if (!el) return;
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      const scale = Math.min(availW / imageWidth, availH / imageHeight, 1);
      setStageScale(scale);
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [imageWidth, imageHeight, containerRef]);

  return { bgImage, stageScale };
}
