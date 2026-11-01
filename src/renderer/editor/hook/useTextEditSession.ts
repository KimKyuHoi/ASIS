import { useEffect, useRef, type RefObject } from 'react';
import { useEditorStore } from '../lib/store';
import type { TextShape } from '../types/shapes';

/**
 * 텍스트 인라인 편집 세션 — textarea 초기화·포커스, Enter/blur 커밋, Escape 취소.
 * 커밋하면 공백만 남은 텍스트는 도형을 지우고, 편집 종료 후 select 도구로 돌아간다.
 * 반환 setText 는 textarea onChange 에서 현재 입력값을 기록한다 (커밋 시 읽음 —
 * 재렌더가 필요 없어 state 가 아니라 ref).
 */
export function useTextEditSession(shape: TextShape): {
  ref: RefObject<HTMLTextAreaElement | null>;
  setText: (value: string) => void;
} {
  const updateShape = useEditorStore((s) => s.updateShape);
  const deleteShape = useEditorStore((s) => s.deleteShape);
  const setEditingId = useEditorStore((s) => s.setEditingId);
  const setTool = useEditorStore((s) => s.setTool);
  const ref = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<string>(shape.text);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.value = shape.text;
    textRef.current = shape.text;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    el.focus();
    el.select();

    // settled 플래그: 언마운트 시 DOM blur 로 인한 이중 commit 방지.
    let settled = false;

    const commit = (): void => {
      if (settled) return;
      settled = true;
      const trimmed = textRef.current.trim();
      if (!trimmed) {
        deleteShape(shape.id);
      } else {
        updateShape(shape.id, { text: trimmed });
      }
      setEditingId(null);
      setTool('select');
    };

    const cancel = (): void => {
      if (settled) return;
      settled = true;
      if (!shape.text) deleteShape(shape.id);
      setEditingId(null);
      setTool('select');
    };

    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
      e.stopPropagation();
    };

    // textarea 가 포커스를 잃을 때 commit — toolbar 로 이동한 경우는 제외.
    // relatedTarget 은 브라우저가 직접 설정하는 실제 포커스 대상 요소이므로
    // Chromium select popup 의 shadow DOM / native OS popup 여부와 무관하게
    // .closest('.toolbar') 가 정확히 동작한다.
    const handleBlur = (e: FocusEvent): void => {
      const to = e.relatedTarget;
      if (to instanceof Element && to.closest('.toolbar')) return;
      commit();
    };

    el.addEventListener('keydown', handleKey);
    el.addEventListener('blur', handleBlur);

    return () => {
      el.removeEventListener('keydown', handleKey);
      el.removeEventListener('blur', handleBlur);
    };
  }, [shape.id, shape.text, updateShape, deleteShape, setEditingId, setTool]);

  const setText = (value: string): void => {
    textRef.current = value;
  };
  return { ref, setText };
}
