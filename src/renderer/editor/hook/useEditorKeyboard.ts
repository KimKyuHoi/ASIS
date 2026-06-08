import { useEffect } from 'react';
import type { RefObject } from 'react';
import type Konva from 'konva';
import type { Shape, Tool } from '../types/shapes';
import { useEditorStore } from '../lib/store';
import { cancelEditor, copyToClipboard, savePngFile } from '../lib/editor-actions';
import { addImageFromSource } from '../lib/image-utils';

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

/**
 * 에디터 전역 키보드 단축키 등록.
 *
 * - 텍스트 인라인 편집 중(editingId !== null)에는 모든 단축키 무시.
 * - capture phase 로 등록해 textarea stopPropagation 에 상관없이 우리가 먼저 받음.
 *   (단, editingId 체크로 textarea 활성 중에는 곧바로 return.)
 */
export function useEditorKeyboard(
  stageRef: RefObject<Konva.Stage | null>,
  pixelRatio: number,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useEditorStore.getState();
      console.info(
        `[asis editor] keydown key=${e.key} code=${e.code} editingId=${st.editingId} selected=${st.selectedIds.length}`,
      );
      if (st.editingId !== null) return;
      const isMeta = e.metaKey || e.ctrlKey;
      // e.code 는 *물리 키 코드* (KeyV/KeyR…) — 한영 IME, 대소문자, Caps Lock 무관.
      if (isMeta && e.code === 'KeyC') {
        e.preventDefault();
        if (st.selectedIds.length > 0) {
          // 도형이 선택된 경우 → 내부 도형 클립보드에 복사
          shapesClipboard = st.shapes.filter((s) => st.selectedIds.includes(s.id));
          pasteCount = 0;
        } else {
          // 선택 없음 → 기존 동작: 이미지 전체를 시스템 클립보드로 export
          copyToClipboard(stageRef.current, pixelRatio);
        }
      } else if (isMeta && e.code === 'KeyS') {
        e.preventDefault();
        savePngFile(stageRef.current, pixelRatio);
      } else if (isMeta && e.code === 'KeyV') {
        e.preventDefault();
        if (shapesClipboard.length > 0) {
          // 내부 도형 클립보드가 있으면 도형 붙여넣기
          pasteCount += 1;
          const dx = PASTE_OFFSET * pasteCount;
          const dy = PASTE_OFFSET * pasteCount;
          const newShapes = shapesClipboard.map((s) => ({
            ...offsetShape(s, dx, dy),
            id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          }));
          useEditorStore.getState().pasteShapes(newShapes);
        } else {
          // 내부 클립보드 없음 → 시스템 클립보드에서 이미지 붙여넣기
          navigator.clipboard.read().then((items) => {
            const firstImageItem = items.find((it) =>
              it.types.some((t) => t.startsWith('image/')),
            );
            if (!firstImageItem) return undefined;
            const imageType = firstImageItem.types.find((t) =>
              t.startsWith('image/'),
            );
            if (!imageType) return undefined;
            return firstImageItem.getType(imageType).then((blob) => {
              addImageFromSource(blob).catch((err: unknown) => {
                console.error('[asis editor] paste image 실패', err);
              });
            });
          }).catch((err: unknown) => {
            console.error('[asis editor] paste 실패', err);
          });
        }
      } else if (isMeta && !e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        st.undo();
      } else if (isMeta && e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        st.redo();
      } else if (isMeta && e.code === 'KeyW') {
        e.preventDefault();
        cancelEditor();
      } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        // +(=) 줌 인 — 작은 캡처 돋보기. ⌘+ 도 동일. clamp 는 store setZoom 이 처리.
        e.preventDefault();
        st.setZoom(st.zoom * 1.25);
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        // - 줌 아웃. ⌘- 도 동일.
        e.preventDefault();
        st.setZoom(st.zoom / 1.25);
      } else if (isMeta && e.code === 'Digit0') {
        e.preventDefault();
        st.setZoom(1);
      } else if (e.key === 'Escape') {
        cancelEditor();
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        st.selectedIds.length > 0
      ) {
        e.preventDefault();
        st.deleteSelected();
      } else if (!isMeta && !e.shiftKey) {
        const map: Partial<Record<string, Tool>> = {
          KeyV: 'select',
          KeyR: 'rect',
          KeyO: 'ellipse',
          KeyA: 'arrow',
          KeyL: 'line',
          KeyP: 'pen',
          KeyT: 'text',
          KeyH: 'highlight',
          KeyB: 'blur',
          KeyM: 'mosaic',
          KeyE: 'eraser',
          KeyS: 'step',
        };
        const next = map[e.code];
        if (next) st.setTool(next);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [stageRef, pixelRatio]);
}
