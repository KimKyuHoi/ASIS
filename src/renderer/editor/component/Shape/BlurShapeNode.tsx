import { useEffect, useState, type JSX } from 'react';
import { Image as KImage, Rect as KRect } from 'react-konva';
import Konva from 'konva';
import type { BlurShape } from '../../types/shapes';
import type { ShapeBackground } from '../../types/background';

/**
 * 블러 도형 — 배경 이미지에서 *crop 영역만* Konva.Filters.Blur 로 가우시안 블러.
 * 별도 sub-component 인 이유:
 *   - shape.kind === 'blur' 로 type narrowed → useEffect deps 가 단순 (conditional 없음)
 *   - blur 노드 ref + cache 호출이 다른 도형과 lifecycle 다름
 */
export function BlurShapeNode({
  shape,
  background,
  draggable,
  onSelect,
  onContextMenu,
  onDragEnd,
  onTransformEnd,
}: {
  shape: BlurShape;
  /** 잘라 쓸 배경과 배율 — 없으면(배경 없는 재생 오버레이 등) 검정 자리표시. */
  background: ShapeBackground | null;
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragEnd: (node: Konva.Image) => void;
  onTransformEnd: (node: Konva.Image) => void;
}): JSX.Element {
  const [node, setNode] = useState<Konva.Image | null>(null);

  // 블러 props 변화 시 cache 다시 — Konva 표준 패턴.
  // 배경·배율이 바뀌어도 다시 — 크롭 적용·undo 로 배경이 바뀌면 캐시가 옛 배경의
  // 픽셀을 계속 보여 준다(실측: 크롭 후 복사본의 블러 영역만 다시 연 결과와 달랐다).
  const image = background?.image ?? null;
  const pixelRatio = background?.pixelRatio ?? 1;
  useEffect(() => {
    if (!node) return;
    node.cache();
    node.getLayer()?.batchDraw();
  }, [node, image, pixelRatio, shape.x, shape.y, shape.w, shape.h, shape.blurRadius]);

  // 배경 없음 — 검정 placeholder.
  if (!image) {
    return (
      <KRect
        id={shape.id}
        x={shape.x}
        y={shape.y}
        width={shape.w}
        height={shape.h}
        fill="rgba(18, 18, 22, 0.94)"
        onClick={onSelect}
        onContextMenu={onContextMenu}
      />
    );
  }

  return (
    <KImage
      id={shape.id}
      ref={setNode}
      image={image}
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      crop={{
        x: shape.x * pixelRatio,
        y: shape.y * pixelRatio,
        width: shape.w * pixelRatio,
        height: shape.h * pixelRatio,
      }}
      filters={[Konva.Filters.Blur]}
      blurRadius={shape.blurRadius}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onContextMenu={onContextMenu}
      onDragEnd={(e): void => onDragEnd(e.target as Konva.Image)}
      onTransformEnd={(e): void => onTransformEnd(e.target as Konva.Image)}
    />
  );
}
