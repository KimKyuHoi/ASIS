import { useEffect, useRef } from 'react';
import type { CSSProperties, JSX } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../lib/store';
import type { TextShape } from '../types/shapes';

/**
 * 텍스트 도형 인라인 편집 textarea.
 *
 * 줄바꿈 전략
 *   - textarea 는 fixedWidth(이미지 우측 경계까지) 고정 너비로 시각 줄바꿈.
 *   - commit 시 canvas measureText 로 동일 폰트·너비 기준 줄바꿈 위치를 계산해
 *     텍스트에 \n 을 직접 삽입해서 저장.
 *   - KText 는 저장된 \n 기준으로만 렌더링 — CSS ↔ canvas font metric 차이에 무관.
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

    const commit = (): void => {
      const trimmed = textRef.current.trim();
      if (!trimmed) {
        deleteShape(shape.id);
      } else {
        // shape.width(생성 시 정해진 너비)를 기준으로 줄바꿈.
        // 이미지 경계를 넘지 않도록 min 적용. KText padding 4px×2 = 8 제외.
        const maxW = Math.max(40, imageWidth - shape.x);
        const wrapWidth = Math.max(32, Math.min(shape.width, maxW) - 8);
        const wrapped = applyLineWraps(trimmed, wrapWidth, shape.fontSize, shape.fontFamily);
        updateShape(shape.id, { text: wrapped });
      }
      setEditingId(null);
      setTool('select');
    };

    const cancel = (): void => {
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

    const handleOutsideClick = (e: MouseEvent): void => {
      if (e.target === el) return;
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
  }, [
    shape.id, shape.text, shape.x, shape.width, shape.fontSize, shape.fontFamily,
    stageScale, imageWidth, updateShape, deleteShape, setEditingId, setTool,
  ]);

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

/**
 * canvas measureText 로 줄바꿈 위치를 계산해 텍스트에 \n 을 삽입한다.
 * Konva Text 노드가 내부적으로 같은 방식으로 wrap 하므로 결과가 일치한다.
 *
 * @param text       원문 (이미 \n 포함 가능)
 * @param maxWidth   stage 좌표 픽셀 (KText padding 제외한 실제 텍스트 영역)
 * @param fontSize   stage 좌표 폰트 크기
 * @param fontFamily CSS font-family 문자열
 */
function applyLineWraps(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text;
  ctx.font = `${fontSize}px ${fontFamily}`;

  const result: string[] = [];
  for (const para of text.split('\n')) {
    if (para === '') {
      result.push('');
      continue;
    }
    let line = '';
    let paraResult = '';
    for (const char of para) {
      const test = line + char;
      if (ctx.measureText(test).width > maxWidth && line !== '') {
        paraResult += `${line}\n`;
        line = char;
      } else {
        line = test;
      }
    }
    result.push(paraResult + line);
  }
  return result.join('\n');
}
