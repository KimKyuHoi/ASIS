import type { CSSProperties, JSX } from 'react';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { KeyCap } from '../../../design-system/component';
import type { HoverElement, Rect } from '../../types/selection';
import { selectionStrings } from '../../lib/strings';

/** AX 요소 윤곽 — 측정 사각형이 없을 때 hover 요소의 bounds 를 점선으로 표시. */
export function ElementOutline({ rect }: { rect: Rect }): JSX.Element {
  const style: CSSProperties = { left: rect.x, top: rect.y, width: rect.w, height: rect.h };
  return <div className="element-outline" style={style} />;
}

/**
 * 우상단 정보 패널.
 *  - rect 있음: 측정 사각형의 w×h + 좌상단 좌표
 *  - hoverElement 있음: AX 요소 이름(있으면) + w×h
 */
export function RulerInfoPanel({ rect, hoverElement }: {
  rect: Rect | null;
  hoverElement: HoverElement | null;
}): JSX.Element | null {
  const t = selectionStrings[useLanguage()];
  if (rect) {
    return (
      <div className="hover-info">
        <div className="hover-info__name">{t.rulerLabel}</div>
        <div className="hover-info__size tabular">
          {Math.round(rect.w)} × {Math.round(rect.h)} px
        </div>
        <div className="hover-info__size tabular">
          @ {Math.round(rect.x)}, {Math.round(rect.y)}
        </div>
      </div>
    );
  }
  if (!hoverElement) return null;
  // AX 라벨이 없거나 비면 이름 줄을 생략한다.
  const name = hoverElement.name ?? '';
  return (
    <div className="hover-info">
      {name === '' ? null : <div className="hover-info__name">{name}</div>}
      <div className="hover-info__size tabular">
        {Math.round(hoverElement.w)} × {Math.round(hoverElement.h)} px
      </div>
    </div>
  );
}

/** idle·measured 에서 보이고, 드래그 중엔 숨긴다. ESC 의 의미가 상태에 따라 바뀐다. */
export function RulerHint({ visible, measured }: {
  visible: boolean;
  measured: boolean;
}): JSX.Element {
  const t = selectionStrings[useLanguage()];
  return (
    <div className={`hint ${visible ? 'hint--visible' : 'hint--hidden'}`}>
      <KeyCap shortcut="Escape" />
      <span className="hint__label">{measured ? t.rulerClear : t.rulerClose}</span>
      <span className="hint__divider" aria-hidden="true" />
      <span>{t.rulerHint}</span>
    </div>
  );
}
