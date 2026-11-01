import { useEffect, useState, type RefObject } from 'react';
import { useEditorStore } from '../lib/store';
import { peekDecoded } from '../lib/decoded-images';

/**
 * 배경 이미지 로드 + Stage 스케일 계산.
 *
 * - imageSrc → HTMLImageElement 디코딩 → bgImage
 *   (크롭 적용·undo 처럼 미리 디코드해 둔 이미지가 있으면 onload 를 기다리지 않고 바로 쓴다 —
 *    lib/decoded-images.ts. 없으면 기존대로 새 이미지가 로드될 때까지 직전 이미지를 둔다.)
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
      // clientWidth/Height 는 padding 을 포함한다 — 그대로 쓰면 Stage 가 padding 만큼
      // (좌우 32px·상 16px) 컨테이너를 넘쳐 오른쪽·아래가 스크롤 밖으로 잘린다.
      // content box 기준으로 맞춘다.
      const cs = getComputedStyle(el);
      const availW = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const scale = Math.min(availW / imageWidth, availH / imageHeight, 1);
      setStageScale(scale);
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [imageWidth, imageHeight, containerRef]);

  const predecoded = imageSrc ? peekDecoded(imageSrc) : undefined;
  return { bgImage: predecoded ?? bgImage, stageScale };
}
