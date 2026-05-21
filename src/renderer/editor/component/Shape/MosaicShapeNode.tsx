import type { JSX } from 'react';
import { Image as KImage, Rect as KRect } from 'react-konva';
import type Konva from 'konva';
import type { MosaicShape } from '../../types/shapes';
import { buildMosaicCanvas } from '../../lib/mosaic';
import { useEditorStore } from '../../lib/store';

/**
 * 모자이크 도형 — offscreen canvas 로 저해상 픽셀 블록 처리 후 KImage 렌더.
 * Canvas 2D API: 원본 → tiny(1/blockSize) → 업스케일(imageSmoothingEnabled=false).
 */
export function MosaicShapeNode({
  shape,
  bgImage,
  draggable,
  onSelect,
  onContextMenu,
  onDragEnd,
  onTransformEnd,
}: {
  shape: MosaicShape;
  bgImage: HTMLImageElement | null;
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragEnd: (node: Konva.Image) => void;
  onTransformEnd: (node: Konva.Image) => void;
}): JSX.Element {
  const imageWidth = useEditorStore((s) => s.imageWidth);
  // bgImage.naturalWidth 는 물리 픽셀, imageWidth 는 논리 픽셀(÷scaleFactor).
  // Retina(2x)에서 pixelRatio=2 이므로 drawImage 소스 좌표를 물리 픽셀로 보정한다.
  const pixelRatio = bgImage && imageWidth > 0 ? bgImage.naturalWidth / imageWidth : 1;
  const canvas = bgImage
    ? buildMosaicCanvas(bgImage, shape.x, shape.y, shape.w, shape.h, shape.blockSize, pixelRatio)
    : null;

  const absW = Math.max(1, Math.abs(shape.w));
  const absH = Math.max(1, Math.abs(shape.h));
  const drawX = shape.w >= 0 ? shape.x : shape.x + shape.w;
  const drawY = shape.h >= 0 ? shape.y : shape.y + shape.h;

  if (!canvas) {
    return (
      <KRect
        id={shape.id}
        x={drawX}
        y={drawY}
        width={absW}
        height={absH}
        fill="rgba(18, 18, 22, 0.94)"
        onClick={onSelect}
        onContextMenu={onContextMenu}
      />
    );
  }

  return (
    <KImage
      id={shape.id}
      image={canvas}
      x={drawX}
      y={drawY}
      width={absW}
      height={absH}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onContextMenu={onContextMenu}
      onDragEnd={(e): void => onDragEnd(e.target as Konva.Image)}
      onTransformEnd={(e): void => onTransformEnd(e.target as Konva.Image)}
    />
  );
}

