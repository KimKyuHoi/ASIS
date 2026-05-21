import { useEffect, useRef } from 'react';
import type { CSSProperties, JSX } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../lib/store';
import type { TextShape } from '../types/shapes';

/**
 * 텍스트 도형 인라인 편집 textarea.
 *
 * 줄바꿈 전략
 *   - textarea 는 shape.width 고정 너비로 시각 줄바꿈 (CSS word-wrap).
 *   - commit 시 텍스트를 원문 그대로 저장 — 소프트 \n 삽입하지 않음.
 *   - KText 의 wrap="word" 가 shape.width 기준으로 자동 줄바꿈.
 *     박스를 넓히면 자동으로 한 줄, 좁히면 자동으로 여러 줄 — PPT 동작.
 *   - 사용자가 Enter 를 직접 눌러 삽입한 \n 만 shape.text 에 보존된다.
 *
 * 외부 클릭 감지 전략
 *   - window.mousedown 대신 textarea.blur 를 사용한다.
 *   - mousedown 기반은 Chromium select popup 이 shadow DOM / native OS popup
 *     에 렌더링되어 e.target 이 .toolbar 체크를 우회하는 경우가 있다.
 *   - blur.relatedTarget 은 항상 실제 포커스를 받은 DOM 요소 자체를 가리키므로
 *     .closest('.toolbar') 가 정확하게 동작한다.
 */
export function TextEditor({
  shape,
  stageWrap,
  stageScale,
  imageWidth,
}: {
  shape: TextShape;
  stageWrap: HTMLElement;
  stageScale: number;
  imageWidth: number;
}): JSX.Element {
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
      const to = e.relatedTarget as Element | null;
      if (to?.closest?.('.toolbar')) return;
      commit();
    };

    el.addEventListener('keydown', handleKey);
    el.addEventListener('blur', handleBlur);

    return () => {
      el.removeEventListener('keydown', handleKey);
      el.removeEventListener('blur', handleBlur);
    };
  }, [shape.id, shape.text, updateShape, deleteShape, setEditingId, setTool]);

  const displayFontSize = Math.max(14, shape.fontSize * stageScale);
  // shape.width 를 기준으로 textarea 너비 결정. 이미지 오른쪽 경계는 상한선.
  const maxStageW = Math.max(40, imageWidth - shape.x);
  const fixedWidth = Math.max(80, Math.min(shape.width, maxStageW) * stageScale);

  const style: CSSProperties = {
    position: 'absolute',
    left: shape.x * stageScale,
    top: shape.y * stageScale,
    width: fixedWidth,
    padding: '2px 4px',
    border: '1px dashed rgba(94, 162, 255, 0.8)',
    borderRadius: 2,
    background: 'transparent',
    outline: 'none',
    resize: 'none',
    color: shape.fill,
    fontSize: displayFontSize,
    fontFamily: shape.fontFamily,
    lineHeight: 1.2,
    letterSpacing: '0.01em',
    // overflow 미지정(default auto) — hidden 은 Chromium/Electron 에서 textarea
    // 내부 word-wrap 알고리즘을 비활성화해 한 줄로 이어버린다.
    // 시각적 클리핑은 상위 stageWrap(overflow:hidden) 이 담당한다.
    overflowWrap: 'break-word',
    wordBreak: 'break-all',
    whiteSpace: 'pre-wrap',
    caretColor: shape.fill,
    zIndex: 1000,
    boxSizing: 'border-box',
  };

  return createPortal(
    <textarea
      ref={ref}
      defaultValue={shape.text}
      onChange={(e): void => {
        textRef.current = e.target.value;
        const el = e.currentTarget;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      }}
      placeholder="텍스트 입력"
      rows={1}
      style={style}
    />,
    stageWrap,
  );
}
