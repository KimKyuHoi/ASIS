import { useEffect, useRef } from 'react';
import type { CSSProperties, JSX } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../lib/store';
import type { TextShape } from '../types/shapes';

/**
 * 텍스트 도형 인라인 편집 textarea.
 *
 * react-konva-utils 의 Html 은 stage-wrap 안에서 좌표 추적이 의도대로
 * 동작하지 않아 폐기 (좌상단으로 박힘). 대신 createPortal 로 stage-wrap div 의
 * *직접 자식* 으로 textarea 를 마운트하고, position:absolute + (shape.x*scale, shape.y*scale)
 * 로 캔버스 좌표를 viewport pixel 로 직접 계산.
 *
 * 좌표 계산 규칙
 *   - shape.x, shape.y: Stage 좌표 (이미지 픽셀)
 *   - stage-wrap div 가 position:relative + width/height = imageSize * scale
 *   - 그 안 absolute 자식 의 left/top = shape.x * scale, shape.y * scale → 캔버스의 그 자리
 *   - fontSize 도 scale 적용 (시각적 크기 일치)
 */
export function TextEditor({
  shape,
  stageWrap,
  stageScale,
}: {
  shape: TextShape;
  stageWrap: HTMLElement;
  stageScale: number;
}): JSX.Element {
  const updateShape = useEditorStore((s) => s.updateShape);
  const deleteShape = useEditorStore((s) => s.deleteShape);
  const setEditingId = useEditorStore((s) => s.setEditingId);
  const ref = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<string>(shape.text);

  // mount 시 textarea focus + 입력 race 방지를 위해 외부 click listener 는 setTimeout(0).
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.value = shape.text;
    textRef.current = shape.text;
    // height 을 content 에 맞춤.
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    el.focus();
    el.select();

    const commit = (): void => {
      const trimmed = textRef.current.trim();
      if (!trimmed) {
        deleteShape(shape.id);
      } else if (trimmed !== shape.text) {
        updateShape(shape.id, { text: trimmed });
      }
      setEditingId(null);
    };

    const cancel = (): void => {
      if (!shape.text) deleteShape(shape.id);
      setEditingId(null);
    };

    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
      // 글로벌 단축키로 새지 않게.
      e.stopPropagation();
    };

    const handleOutsideClick = (e: MouseEvent): void => {
      if (e.target === el) return;
      // Toolbar 클릭(폰트·색상·크기 변경 등)은 편집 유지 — commit 하지 않음.
      // toolbar mousedown 이 select 드롭다운을 열기 전 commit 을 호출하면
      // 리렌더로 native dropdown 이 즉시 닫히는 현상 방지.
      if ((e.target as Element).closest?.('.toolbar')) return;
      commit();
    };

    el.addEventListener('keydown', handleKey);
    const t = window.setTimeout(() => {
      window.addEventListener('mousedown', handleOutsideClick);
    }, 0);

    return () => {
      window.clearTimeout(t);
      el.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [shape.id, shape.text, updateShape, deleteShape, setEditingId]);

  // viewport pixel 단위 — stage-wrap 안 absolute 좌표.
  const displayFontSize = Math.max(14, shape.fontSize * stageScale);

  const style: CSSProperties = {
    position: 'absolute',
    left: shape.x * stageScale,
    top: shape.y * stageScale,
    minWidth: 80,
    width: 'auto',
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
    overflow: 'hidden',
    overflowWrap: 'break-word',
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
        // content 따라 height 자동 갱신.
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
