import { useEditorStore } from './store';
import { addImageFromSource } from './image-utils';
import { newShapeId } from './drawing';
import type { Shape } from '../types/shapes';

// 에디터 세션 내 도형 클립보드 — 시스템 클립보드와 별개로 도형을 복붙한다.
let shapesClipboard: Shape[] = [];

// 붙여넣기 누적 오프셋 — 같은 클립보드를 여러 번 붙여넣어도 겹치지 않도록.
let pasteCount = 0;

const PASTE_OFFSET = 12;

function offsetShape(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.kind) {
    case 'rect':
    case 'highlight':
    case 'blur':
    case 'mosaic':
    case 'text':
    case 'step':
    case 'image':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'ellipse':
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    case 'arrow':
    case 'line':
    case 'pen':
      return { ...shape, points: shape.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}

/** 선택된 도형을 내부 도형 클립보드로 복사. */
export function copySelectedShapes(): void {
  const st = useEditorStore.getState();
  shapesClipboard = st.shapes.filter((s) => st.selectedIds.includes(s.id));
  pasteCount = 0;
}

/** 시스템 클립보드의 첫 이미지를 캔버스에 추가. 이미지가 없으면 아무것도 안 함. */
async function pasteSystemImage(): Promise<void> {
  const items = await navigator.clipboard.read();
  const item = items.find((it) => it.types.some((t) => t.startsWith('image/')));
  const imageType = item?.types.find((t) => t.startsWith('image/'));
  if (!item || !imageType) return;
  await addImageFromSource(await item.getType(imageType));
}

/**
 * ⌘V — 내부 도형 클립보드가 있으면 도형 붙여넣기(누적 오프셋),
 * 없으면 시스템 클립보드에서 이미지 붙여넣기.
 */
export function pasteShapesOrImage(): void {
  if (shapesClipboard.length > 0) {
    pasteCount += 1;
    const d = PASTE_OFFSET * pasteCount;
    const newShapes = shapesClipboard.map((s) => ({ ...offsetShape(s, d, d), id: newShapeId() }));
    useEditorStore.getState().pasteShapes(newShapes);
    return;
  }
  pasteSystemImage().catch((err: unknown) => {
    console.error('[asis editor] paste 실패', err);
  });
}
