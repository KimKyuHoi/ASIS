import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Image as KImage } from 'react-konva';
import type Konva from 'konva';
import type { ImageShape } from '../../types/shapes';

/**
 * 이미지 도형 — src(data URL) 을 HTMLImageElement 로 디코딩 후 KImage 렌더.
 * src 는 store 에 base64 로 저장되어 있어 mount 시 1회 디코드.
 */
export function ImageShapeNode({
  shape,
  draggable,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: {
  shape: ImageShape;
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragEnd: (node: Konva.Image) => void;
  onTransformEnd: (node: Konva.Image) => void;
}): JSX.Element | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;
    const el = new Image();
    el.onload = (): void => {
      if (active) setImg(el);
    };
    el.onerror = (): void => {
      console.error('[asis editor] ImageShape src 로드 실패', shape.id);
    };
    el.src = shape.src;
    return () => {
      active = false;
    };
  }, [shape.src, shape.id]);

  if (!img) return null;

  return (
    <KImage
      id={shape.id}
      image={img}
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      rotation={shape.rotation ?? 0}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e): void => onDragEnd(e.target as Konva.Image)}
      onTransformEnd={(e): void => onTransformEnd(e.target as Konva.Image)}
    />
  );
}
