import type { JSX } from 'react';
import { Select } from '../../../design-system/component';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { editorStrings } from '../../lib/strings';
import { DASH_STYLES } from '../../lib/dash';
import {
  BLUR_RADII,
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS,
  MOSAIC_BLOCK_SIZES,
  STROKE_WIDTHS,
} from '../../lib/store';
import type { ToolbarStyle } from '../../hook/useToolbarStyle';
import type { TextAlign } from '../../types/shapes';
import { DashPreview, ValueButtons } from './Buttons';
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon } from './Icons';

type Strings = (typeof editorStrings)[keyof typeof editorStrings];
type PanelProps = { style: ToolbarStyle; t: Strings };

const ALIGNS: readonly [TextAlign, () => JSX.Element][] = [
  ['left', AlignLeftIcon],
  ['center', AlignCenterIcon],
  ['right', AlignRightIcon],
];

function alignTitle(t: Strings, a: TextAlign): string {
  if (a === 'left') return t.toolbar.alignLeft;
  if (a === 'center') return t.toolbar.alignCenter;
  return t.toolbar.alignRight;
}

/** 정렬 3버튼 + 줄간격 — text 전용 (step 제외). */
function TextFormatting({ style, t }: PanelProps): JSX.Element {
  return (
    <>
      <div className="toolbar__group toolbar__group--align">
        {ALIGNS.map(([a, Icon]) => (
          <button
            key={a}
            type="button"
            className={`iconbtn ${style.values.textAlign === a ? 'iconbtn--active' : ''}`}
            onClick={(): void => style.setTextAlign(a)}
            title={alignTitle(t, a)}
          >
            <Icon />
          </button>
        ))}
      </div>
      <ValueButtons
        label={t.toolbar.lineHeight}
        values={LINE_HEIGHTS}
        active={style.values.lineHeight}
        onPick={style.setLineHeight}
        titleOf={t.toolbar.lineHeightValue}
      />
    </>
  );
}

/** 폰트·크기 (+ text 면 정렬·줄간격). */
function TextPanel({ style, t }: PanelProps): JSX.Element {
  return (
    <>
      <div className="toolbar__group">
        <span className="slider-label">{t.toolbar.font}</span>
        <Select
          className="font-select"
          value={style.values.fontFamily}
          options={FONT_FAMILIES}
          onChange={style.setFontFamily}
          title={t.toolbar.fontChange}
          aria-label={t.toolbar.fontChange}
        />
      </div>
      <ValueButtons
        label={t.toolbar.size}
        values={FONT_SIZES}
        active={style.values.fontSize}
        onPick={style.setFontSize}
        titleOf={(s): string => `${String(s)}px`}
      />
      {style.showTextFormatting ? <TextFormatting style={style} t={t} /> : null}
    </>
  );
}

/** 선 두께 + 선 스타일(점선). */
function StrokePanel({ style, t }: PanelProps): JSX.Element {
  return (
    <>
      <div className="toolbar__group toolbar__group--strokes">
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            className={`stroke ${style.values.strokeWidth === w ? 'stroke--active' : ''}`}
            onClick={(): void => style.setStrokeWidth(w)}
            aria-label={t.toolbar.strokeWidthLabel(w)}
            title={`${String(w)}px`}
          >
            <span className="stroke__dot" style={{ width: Math.min(w, 14), height: Math.min(w, 14) }} />
          </button>
        ))}
      </div>
      <div className="toolbar__divider" aria-hidden="true" />
      <div className="toolbar__group toolbar__group--dashes">
        <span className="slider-label">{t.toolbar.lineLabel}</span>
        {DASH_STYLES.map((d) => (
          <button
            key={d}
            type="button"
            className={`dash ${style.values.dash === d ? 'dash--active' : ''}`}
            onClick={(): void => style.setDash(d)}
            aria-label={t.toolbar.dashAriaLabel(t.dashStyle[d])}
            title={t.dashStyle[d]}
          >
            <DashPreview style={d} />
          </button>
        ))}
      </div>
    </>
  );
}

/** 도구·선택에 따라 바뀌는 가운데 스타일 패널 (lib/toolbar-style 의 stylePanel). */
export function StylePanel({ style }: { style: ToolbarStyle }): JSX.Element | null {
  const t = editorStrings[useLanguage()];
  switch (style.panel) {
    case 'none':
      return null;
    case 'blur':
      return (
        <ValueButtons
          label={t.toolbar.blur}
          values={BLUR_RADII}
          active={style.values.blurRadius}
          onPick={style.setBlurRadius}
          titleOf={t.toolbar.blurValue}
        />
      );
    case 'mosaic':
      return (
        <ValueButtons
          label={t.toolbar.block}
          values={MOSAIC_BLOCK_SIZES}
          active={style.values.mosaicBlockSize}
          onPick={style.setMosaicBlockSize}
          titleOf={t.toolbar.blockValue}
        />
      );
    case 'text':
      return <TextPanel style={style} t={t} />;
    case 'stroke':
      return <StrokePanel style={style} t={t} />;
  }
}
