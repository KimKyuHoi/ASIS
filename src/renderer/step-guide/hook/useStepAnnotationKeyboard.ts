import { useEffect } from 'react';
import { codeToKeyName } from '../../../shared/key-name';
import { useEditorStore } from '../../editor/lib/store';
import { toolForKeyName } from '../../editor/lib/editor-hotkeys';
import { copySelectedShapes, pasteShapesOrImage } from '../../editor/lib/editor-clipboard';

type EditorState = ReturnType<typeof useEditorStore.getState>;
type Action = () => void;

const ZOOM_STEP = 1.25;

/** ⌘ 조합 — undo/redo, 도형 복사·붙여넣기(도형 클립보드라 다른 단계에 붙여 넣을 수 있다). */
function metaAction(e: KeyboardEvent, st: EditorState): Action | null {
  if (!(e.metaKey || e.ctrlKey)) return null;
  if (e.code === 'KeyZ') return e.shiftKey ? st.redo : st.undo;
  if (e.code === 'KeyC' && st.selectedIds.length > 0) return copySelectedShapes;
  if (e.code === 'KeyV') return pasteShapesOrImage;
  return null;
}

/** 줌·삭제. */
function plainAction(e: KeyboardEvent, st: EditorState): Action | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.code === 'Equal' || e.code === 'NumpadAdd') return () => st.setZoom(st.zoom * ZOOM_STEP);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
    return () => st.setZoom(st.zoom / ZOOM_STEP);
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedIds.length > 0) {
    return st.deleteSelected;
  }
  return null;
}

/** 수식키 없는 도구 단축키 — 환경설정의 에디터 도구 표 그대로. */
function toolAction(e: KeyboardEvent, st: EditorState): Action | null {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const keyName = codeToKeyName(e.code);
  const next = keyName === null ? null : toolForKeyName(keyName);
  return next === null ? null : () => st.setTool(next);
}

/**
 * 주석 편집 키 — 이미지 에디터와 같은 동작(도구 단축키·⌘Z/⌘⇧Z·⌘C/⌘V·삭제·줌).
 * 에디터의 useEditorKeyboard 는 ESC·⌘W·⌘S 가 window.editor(이미지 에디터 창 IPC)를 부르므로
 * 재사용하지 않고 같은 동작을 다시 묶는다(GIF 스튜디오 useAnnotationKeyboard 와 같은 이유).
 * 제목·문구 입력칸에 포커스가 있거나 텍스트 주석을 편집 중이면 건드리지 않는다.
 * ⌘S(저장)는 useEditorWindowEvents 가 맡는다.
 */
export function useStepAnnotationKeyboard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      const st = useEditorStore.getState();
      if (st.editingId !== null) return;
      if (e.target instanceof Element && e.target.closest('input, select, textarea')) return;
      const action = metaAction(e, st) ?? plainAction(e, st) ?? toolAction(e, st);
      if (action === null) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled]);
}
