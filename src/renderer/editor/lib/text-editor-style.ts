import type { CSSProperties } from 'react';
import type { TextShape } from '../types/shapes';

/**
 * 인라인 편집 textarea 스타일 — 도형 위치·폰트를 stageScale 로 화면 좌표에 맞춘다.
 * shape.width 를 기준으로 textarea 너비 결정. 이미지 오른쪽 경계는 상한선.
 */
export function textEditorStyle(
  shape: TextShape,
  { stageScale, imageWidth }: { stageScale: number; imageWidth: number },
): CSSProperties {
  const displayFontSize = Math.max(14, shape.fontSize * stageScale);
  const maxStageW = Math.max(40, imageWidth - shape.x);
  const fixedWidth = Math.max(80, Math.min(shape.width, maxStageW) * stageScale);

  return {
    position: 'absolute',
    left: shape.x * stageScale,
    top: shape.y * stageScale,
    width: fixedWidth,
    padding: '2px 4px',
    // 편집 중 표시 — 브랜드 강조색 점선 (DOM 이라 토큰을 바로 쓴다)
    border: 'var(--border-thin) dashed var(--accent)',
    borderRadius: 2,
    background: 'transparent',
    outline: 'none',
    resize: 'none',
    color: shape.fill,
    fontSize: displayFontSize,
    fontFamily: shape.fontFamily,
    textAlign: shape.align ?? 'left',
    lineHeight: shape.lineHeight ?? 1.2,
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
}
