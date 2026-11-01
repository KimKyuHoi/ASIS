import { useEffect } from 'react';
import { codeToKeyName } from '../../../shared/key-name';
import { useEditorStore } from '../../editor/lib/store';
import { toolForKeyName } from '../../editor/lib/editor-hotkeys';
import { copySelectedShapes, pasteShapesOrImage } from '../../editor/lib/editor-clipboard';

type EditorState = ReturnType<typeof useEditorStore.getState>;

const ZOOM_STEP = 1.25;

type Action = () => void;

/** ⌘ 조합 — undo/redo, 도형 복사·붙여넣기(도형 클립보드라 다른 프레임에 붙여 넣을 수 있다). */
function metaAction(e: KeyboardEvent, st: EditorState): Action | null {
  if (!(e.metaKey || e.ctrlKey)) return null;
  if (e.code === 'KeyZ') return e.shiftKey ? st.redo : st.undo;
  if (e.code === 'KeyC') return copySelectedShapes;
  if (e.code === 'KeyV') return pasteShapesOrImage;
  return null;
}

/** 줌·삭제·선택 해제. */
function plainAction(e: KeyboardEvent, st: EditorState): Action | null {
  if (e.code === 'Equal' || e.code === 'NumpadAdd') return () => st.setZoom(st.zoom * ZOOM_STEP);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
    return () => st.setZoom(st.zoom / ZOOM_STEP);
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedIds.length > 0) {
    return st.deleteSelected;
  }
  return null;
}

/** 주석 편집 키 — 이미지 에디터와 같은 동작. 처리했으면 true. */
function handleEditKey(e: KeyboardEvent, st: EditorState): boolean {
  const action = metaAction(e, st) ?? plainAction(e, st);
  if (action === null) return false;
  e.preventDefault();
  action();
  return true;
}

/** 수식키 없는 도구 단축키 — 환경설정의 에디터 도구 표 그대로. */
function handleToolKey(e: KeyboardEvent, st: EditorState): void {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const keyName = codeToKeyName(e.code);
  const next = keyName === null ? null : toolForKeyName(keyName);
  if (next) st.setTool(next);
}

/**
 * GIF 스튜디오 키보드 — 에디터의 useEditorKeyboard 는 ESC·⌘W·⌘C(선택 없음)·⌘S 가
 * window.editor(이미지 에디터 창의 IPC)를 부르므로 재사용하지 않고 같은 동작을 다시 묶는다.
 * Space 는 재생/일시정지, ←/→ 는 이전·다음 프레임, ESC 는 한 단계씩 끝내다 마지막에 창을 닫는다. 재생 중에는 편집 키를 받지 않는다.
 * 숫자 입력·슬라이더에 포커스가 있으면 건드리지 않는다.
 */
export function useAnnotationKeyboard(controls: {
  playing: boolean;
  /** 내보내기(주석 굽기) 중 — 굽기가 video 를 seek 하므로 재생·프레임 이동·편집 키를 모두 막는다. */
  busy: boolean;
  togglePlay: () => void;
  step: (delta: 1 | -1) => void;
  /** ESC — 가장 위의 동작 하나를 끝내거나 창을 닫는다 (hook/useCloseFlow). */
  escape: () => void;
}): void {
  const { playing, busy, togglePlay, step, escape } = controls;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (busy) return;
      const st = useEditorStore.getState();
      if (st.editingId !== null) return;
      if (e.target instanceof Element && e.target.closest('input, select, textarea')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        escape();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        step(e.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (playing || handleEditKey(e, st)) return;
      handleToolKey(e, st);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [playing, busy, togglePlay, step, escape]);
}
