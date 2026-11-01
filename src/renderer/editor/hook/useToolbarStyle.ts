import { useEditorStore } from '../lib/store';
import { hexToRgba } from '../lib/color-utils';
import { isStrokedShape } from '../lib/shape-node';
import {
  displayStyle,
  showTextFormatting,
  stylePanel,
  type StylePanel,
  type StyleValues,
} from '../lib/toolbar-style';
import type { DashStyle, Shape, TextAlign } from '../types/shapes';

type ShapePatch = Partial<Shape>;

export type ToolbarStyle = {
  panel: StylePanel;
  showTextFormatting: boolean;
  /** 표시 값 — 단일 선택이면 그 도형 값, 아니면 다음 도형용 기본값. */
  values: StyleValues;
  color: string;
  setColor: (c: string) => void;
  setStrokeWidth: (w: number) => void;
  setDash: (d: DashStyle) => void;
  setBlurRadius: (r: number) => void;
  setMosaicBlockSize: (bs: number) => void;
  setFontSize: (s: number) => void;
  setFontFamily: (f: string) => void;
  setTextAlign: (a: TextAlign) => void;
  setLineHeight: (h: number) => void;
};

/** 색상 patch — 도형 종류별 적합한 필드. 해당 없는 종류(blur/mosaic/image)는 null. */
function colorPatch(shape: Shape, c: string): ShapePatch | null {
  if (shape.kind === 'highlight') return { fill: hexToRgba(c, 0.4) };
  if (shape.kind === 'text' || shape.kind === 'step') return { fill: c };
  if (isStrokedShape(shape)) return { stroke: c };
  return null;
}

const isTextLike = (s: Shape): boolean => s.kind === 'text' || s.kind === 'step';
const isText = (s: Shape): boolean => s.kind === 'text';

/**
 * 툴바 스타일 상태 — 값을 바꾸면 store 기본값(다음 도형용)을 바꾸고,
 * *선택된 도형 전부* 중 해당 종류에도 즉시 적용한다.
 */
export function useToolbarStyle(): ToolbarStyle {
  const tool = useEditorStore((s) => s.tool);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const shapes = useEditorStore((s) => s.shapes);
  const defaults: StyleValues = {
    fontSize: useEditorStore((s) => s.fontSize),
    fontFamily: useEditorStore((s) => s.fontFamily),
    textAlign: useEditorStore((s) => s.textAlign),
    lineHeight: useEditorStore((s) => s.lineHeight),
    blurRadius: useEditorStore((s) => s.blurRadius),
    mosaicBlockSize: useEditorStore((s) => s.mosaicBlockSize),
    strokeWidth: useEditorStore((s) => s.strokeWidth),
    dash: useEditorStore((s) => s.dash),
  };
  const color = useEditorStore((s) => s.color);
  const selected = selectedIds.length > 0 ? shapes.filter((s) => selectedIds.includes(s.id)) : [];

  // 핸들러는 렌더 외부에서 호출 — store 액션은 getState 로 읽는다.
  const store = (): ReturnType<typeof useEditorStore.getState> => useEditorStore.getState();
  // 조건에 맞는 선택 도형에 patch.
  const applyTo = (match: (s: Shape) => boolean, patch: ShapePatch): void => {
    selected.filter(match).forEach((s) => store().updateShape(s.id, patch));
  };

  return {
    panel: stylePanel(tool, selected),
    showTextFormatting: showTextFormatting(tool, selected),
    values: displayStyle(selected, defaults),
    color,
    setColor: (c) => {
      store().setColor(c);
      selected.forEach((s) => {
        const patch = colorPatch(s, c);
        if (patch) store().updateShape(s.id, patch);
      });
    },
    setStrokeWidth: (w) => {
      store().setStrokeWidth(w);
      applyTo(isStrokedShape, { strokeWidth: w });
    },
    setDash: (d) => {
      store().setDash(d);
      applyTo(isStrokedShape, { dash: d });
    },
    setBlurRadius: (r) => {
      store().setBlurRadius(r);
      applyTo((s) => s.kind === 'blur', { blurRadius: r });
    },
    setMosaicBlockSize: (bs) => {
      store().setMosaicBlockSize(bs);
      applyTo((s) => s.kind === 'mosaic', { blockSize: bs });
    },
    setFontSize: (s) => {
      store().setFontSize(s);
      applyTo(isTextLike, { fontSize: s });
    },
    setFontFamily: (f) => {
      store().setFontFamily(f);
      applyTo(isText, { fontFamily: f });
    },
    setTextAlign: (a) => {
      store().setTextAlign(a);
      applyTo(isText, { align: a });
    },
    setLineHeight: (h) => {
      store().setLineHeight(h);
      applyTo(isText, { lineHeight: h });
    },
  };
}
