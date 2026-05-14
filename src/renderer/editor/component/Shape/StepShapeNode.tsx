import type { JSX } from 'react';
import { Circle as KCircle, Group, Text as KText } from 'react-konva';
import type Konva from 'konva';
import type { StepShape } from '../../types/shapes';

/**
 * 번호 마커 — Group(Circle + Text) 으로 원 안에 숫자.
 * Group 의 origin 이 원 중심 → scale/rotate 가 중심 기준으로 자연스럽게 동작.
 * Text 에 listening={false} 로 Group 의 hit area 가 Circle 영역만 담당.
 */
export function StepShapeNode({
  shape,
  draggable,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: {
  shape: StepShape;
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragEnd: (node: Konva.Group) => void;
  onTransformEnd: (node: Konva.Group) => void;
}): JSX.Element {
  const r = shape.fontSize * 0.8;
  return (
    <Group
      id={shape.id}
      x={shape.x}
      y={shape.y}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e): void => onDragEnd(e.target as Konva.Group)}
      onTransformEnd={(e): void => onTransformEnd(e.target as Konva.Group)}
    >
      <KCircle
        x={0}
        y={0}
        radius={r}
        fill={shape.fill}
      />
      <KText
        x={-r}
        y={-r}
        width={r * 2}
        height={r * 2}
        text={String(shape.num)}
        fill="white"
        fontSize={shape.fontSize}
        fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </Group>
  );
}
