import { useRef, type JSX } from 'react';
import { Text as KText } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../../lib/store';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { editorStrings } from '../../lib/strings';
import { clampXY } from '../../lib/shape-transform';
import { isMultiDrag, type NodeCommon } from '../../lib/shape-node';
import type { TextShape } from '../../types/shapes';

/**
 * 변환 중 — 스케일을 너비·높이에 굽고 scale 1 로 리셋. 세로 스케일이 있었으면 true.
 * 스케일 리셋 전에 현재 너비·높이를 읽는다. node.width() * sx = desiredWidth:
 * attrs_change 로 Transformer 가 _startAbsoluteWidth 를 매 이벤트마다 재초기화하므로
 * sx 는 항상 직전 프레임 기준 증분값 — 누적 compounding 없음.
 */
function applyTextTransform(node: Konva.Node): boolean {
  const sx = node.scaleX();
  const sy = node.scaleY();
  const { imageWidth: iw } = useEditorStore.getState();
  const newWidth = Math.max(40, Math.min(node.width() * sx, iw - node.x()));
  // 높이도 width 변경 *전에* 읽는다 — height attr 이 없으면 Text 는 너비에 따라
  // 자동 높이를 돌려준다.
  const newHeight = sy !== 1 ? Math.max(20, node.height() * sy) : null;
  node.scaleX(1);
  node.scaleY(1);
  node.width(newWidth);
  if (newHeight === null) return false;
  node.height(newHeight);
  return true;
}

/** 변환 종료 — 위치 clamp + 너비(이미지 오른쪽 경계까지) + 필요 시 높이 커밋. */
function commitTextTransform(node: Konva.Node, commitHeight: boolean): Partial<TextShape> {
  node.scaleX(1);
  node.scaleY(1);
  const { x, y } = clampXY(node.position());
  const { imageWidth: iw } = useEditorStore.getState();
  const width = Math.max(40, Math.min(node.width(), iw - x));
  return commitHeight ? { x, y, width, height: Math.max(20, node.height()) } : { x, y, width };
}

/** 텍스트 — 더블클릭으로 인라인 편집(editingId), 편집 중엔 KText 를 숨김. */
export function TextShapeNode({
  shape,
  isEditing,
  ...common
}: NodeCommon & { shape: TextShape; isEditing: boolean }): JSX.Element {
  const t = editorStrings[useLanguage()];
  const updateShape = useEditorStore((s) => s.updateShape);
  const setEditingId = useEditorStore((s) => s.setEditingId);
  // 텍스트 박스 세로 리사이즈 여부 추적 — TransformEnd 에서 height 커밋 여부 결정.
  const textVertResizeRef = useRef(false);
  return (
    <KText
      id={shape.id}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      wrap="word"
      text={shape.text || t.shape.defaultText}
      fill={shape.fill}
      fontSize={shape.fontSize}
      fontFamily={shape.fontFamily}
      align={shape.align ?? 'left'}
      lineHeight={shape.lineHeight ?? 1.2}
      padding={4}
      visible={!isEditing}
      draggable={common.draggable}
      onClick={common.onSelect}
      onTap={common.onSelect}
      onContextMenu={common.onContextMenu}
      onDblClick={(): void => setEditingId(shape.id)}
      onDblTap={(): void => setEditingId(shape.id)}
      onDragEnd={(e): void => {
        if (isMultiDrag()) return;
        const { x, y } = clampXY(e.target.position(), { w: shape.width, h: 0 });
        e.target.position({ x, y });
        updateShape(shape.id, { x, y });
      }}
      onTransformStart={(): void => {
        textVertResizeRef.current = false;
      }}
      onTransform={(e): void => {
        if (applyTextTransform(e.target)) textVertResizeRef.current = true;
      }}
      onTransformEnd={(e): void => {
        // 세로 리사이즈가 한 번이라도 있었거나 이미 고정 height 였으면 height 커밋.
        const commitHeight = textVertResizeRef.current || shape.height !== undefined;
        updateShape(shape.id, commitTextTransform(e.target, commitHeight));
      }}
    />
  );
}
