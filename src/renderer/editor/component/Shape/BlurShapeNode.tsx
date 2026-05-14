import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Image as KImage, Rect as KRect } from 'react-konva';
import Konva from 'konva';
import type { BlurShape } from '../../types/shapes';

/**
 * 블러 도형 — 배경 이미지에서 *crop 영역만* Konva.Filters.Blur 로 가우시안 블러.
 * 별도 sub-component 인 이유:
 *   - shape.kind === 'blur' 로 type narrowed → useEffect deps 가 단순 (conditional 없음)
 *   - blur 노드 ref + cache 호출이 다른 도형과 lifecycle 다름
 */
export function BlurShapeNode({
  shape,
  bgImage,
  draggable,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: {
  shape: BlurShape;
  bgImage: HTMLImageElement | null;
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragEnd: (node: Konva.Image) => void;
  onTransformEnd: (node: Konva.Image) => void;
}): JSX.Element {
  const [node, setNode] = useState<Konva.Image | null>(null);

  // 블러 props 변화 시 cache 다시 — Konva 표준 패턴.
  // type narrowed 라 deps 에 conditional 없이 깔끔.
  useEffect(() => {
    if (!node) return;
    node.cache();
    node.getLayer()?.batchDraw();
  }, [node, shape.x, shape.y, shape.w, shape.h, shape.blurRadius]);

  // bgImage 미로드 — 검정 placeholder.
  if (!bgImage) {
    return (
      <KRect
        id={shape.id}
        x={shape.x}
        y={shape.y}
        width={shape.w}
        height={shape.h}
        fill="rgba(18, 18, 22, 0.94)"
        onClick={onSelect}
      />
    );
  }

  return (
    <KImage
      id={shape.id}
      ref={setNode}
      image={bgImage}
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      crop={{ x: shape.x, y: shape.y, width: shape.w, height: shape.h }}
      filters={[Konva.Filters.Blur]}
      blurRadius={shape.blurRadius}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e): void => onDragEnd(e.target as Konva.Image)}
      onTransformEnd={(e): void => onTransformEnd(e.target as Konva.Image)}
    />
  );
}
