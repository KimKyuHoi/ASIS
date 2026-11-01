import { useEditorStore } from '../../editor/lib/store';

/**
 * 텍스트 인라인 편집 중이면 그 내용을 store 에 확정한다 — editor TextEditor 의 commit 과
 * 같은 결과(빈 텍스트면 삭제). 프레임 전환·내보내기 직전에 부른다.
 *
 * textarea.blur() 로 TextEditor 의 commit 을 유도하는 방식은 창이 포커스를 잃은 상태에서
 * blur 이벤트가 오지 않아 주석이 빠진 채 구워지는 것을 E2E 에서 실측했다 — 그래서 직접 확정한다.
 */
export function commitPendingText(): void {
  const st = useEditorStore.getState();
  const id = st.editingId;
  if (id === null) return;
  // editor StageView 가 stage-wrap 안에 TextEditor textarea 를 띄운다.
  const textarea = document.querySelector<HTMLTextAreaElement>('.stage-wrap textarea');
  if (!textarea) throw new Error('GIF 스튜디오 — 편집 중인데 textarea 가 없다.');
  const text = textarea.value.trim();
  if (text) st.updateShape(id, { text });
  else st.deleteShape(id);
  st.setEditingId(null);
  st.setTool('select');
}

export function newShapeId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
