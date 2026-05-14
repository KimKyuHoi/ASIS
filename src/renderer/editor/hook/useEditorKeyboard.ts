import { useEffect } from 'react';
import type { RefObject } from 'react';
import type Konva from 'konva';
import type { Tool } from '../types/shapes';
import { useEditorStore } from '../lib/store';
import { cancelEditor, copyToClipboard, savePngFile } from '../lib/editor-actions';
import { addImageFromSource } from '../lib/image-utils';

/**
 * 에디터 전역 키보드 단축키 등록.
 *
 * - 텍스트 인라인 편집 중(editingId !== null)에는 모든 단축키 무시.
 * - capture phase 로 등록해 textarea stopPropagation 에 상관없이 우리가 먼저 받음.
 *   (단, editingId 체크로 textarea 활성 중에는 곧바로 return.)
 */
export function useEditorKeyboard(stageRef: RefObject<Konva.Stage | null>): void {
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
        copyToClipboard(stageRef.current);
      } else if (isMeta && e.code === 'KeyS') {
        e.preventDefault();
        savePngFile(stageRef.current);
      } else if (isMeta && e.code === 'KeyV') {
        e.preventDefault();
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
      } else if (isMeta && !e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        st.undo();
      } else if (isMeta && e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        st.redo();
      } else if (isMeta && e.code === 'KeyW') {
        e.preventDefault();
        cancelEditor();
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
  }, [stageRef]);
}
