import type { JSX } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../../shared/i18n/use-language';
import { editorStrings } from '../lib/strings';
import type { TextShape } from '../types/shapes';
import { useTextEditSession } from '../hook/useTextEditSession';
import { textEditorStyle } from '../lib/text-editor-style';

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
  const t = editorStrings[useLanguage()];
  const { ref, setText } = useTextEditSession(shape);
  const style = textEditorStyle(shape, { stageScale, imageWidth });

  return createPortal(
    <textarea
      ref={ref}
      defaultValue={shape.text}
      onChange={(e): void => {
        setText(e.target.value);
        const el = e.currentTarget;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      }}
      placeholder={t.textEditor.placeholder}
      rows={1}
      style={style}
    />,
    stageWrap,
  );
}
