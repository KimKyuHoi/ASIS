import { isStrokedShape } from './shape-node';
import type { DashStyle, Shape, TextAlign, Tool } from '../types/shapes';

/**
 * 툴바 가운데 스타일 패널 종류.
 * - none: 지우개 (스타일 옵션 무관)
 * - blur/mosaic: 도구 active 또는 선택 안에 해당 도형이 하나라도 있으면
 * - text: text/step 도구 active 또는 text/step 도형 선택
 * - stroke: 그 외 (두께·선 스타일)
 */
export type StylePanel = 'none' | 'blur' | 'mosaic' | 'text' | 'stroke';

export function stylePanel(tool: Tool, selected: Shape[]): StylePanel {
  const has = (kind: Shape['kind']): boolean => selected.some((s) => s.kind === kind);
  if (tool === 'eraser') return 'none';
  if (tool === 'blur' || has('blur')) return 'blur';
  if (tool === 'mosaic' || has('mosaic')) return 'mosaic';
  if (tool === 'text' || tool === 'step' || has('text') || has('step')) return 'text';
  return 'stroke';
}

/** 정렬·줄간격은 text 전용 (step 제외). */
export function showTextFormatting(tool: Tool, selected: Shape[]): boolean {
  return tool === 'text' || selected.some((s) => s.kind === 'text');
}

export type StyleValues = {
  fontSize: number;
  fontFamily: string;
  textAlign: TextAlign;
  lineHeight: number;
  blurRadius: number;
  mosaicBlockSize: number;
  strokeWidth: number;
  dash: DashStyle;
};

function textValues(only: Shape | null): Partial<StyleValues> {
  if (only?.kind === 'step') return { fontSize: only.fontSize };
  if (only?.kind !== 'text') return {};
  return {
    fontSize: only.fontSize,
    fontFamily: only.fontFamily,
    textAlign: only.align ?? 'left',
    lineHeight: only.lineHeight ?? 1.2,
  };
}

/**
 * 툴바 표시 값 — 단일 선택일 때만 그 도형의 값, 아니면 store 의 기본값(다음 도형용).
 */
export function displayStyle(selected: Shape[], defaults: StyleValues): StyleValues {
  const only = selected.length === 1 ? selected[0] : null;
  const values: StyleValues = { ...defaults, ...textValues(only) };
  if (only?.kind === 'blur') values.blurRadius = only.blurRadius;
  if (only?.kind === 'mosaic') values.mosaicBlockSize = only.blockSize;
  if (only !== null && isStrokedShape(only)) {
    values.strokeWidth = only.strokeWidth;
    values.dash = only.dash ?? 'solid';
  }
  return values;
}
