import type { CSSProperties, JSX } from 'react';
import { CaptureFrame } from '../../../design-system/component';
import type { Rect } from '../../types/selection';
import { chipPlacement } from '../../lib/rect-utils';

// ── 선택 사각형 주변 장식 (렌더 path 는 declarative) ─────────────────────────

/** 선택 영역 바깥을 어둡게 — 상하좌우 4개 띠. */
export function DimStrips({ rect }: { rect: Rect }): JSX.Element {
  return (
    <>
      <div className="dim-strip dim-strip--top" style={{ height: `${rect.y}px` }} />
      <div
        className="dim-strip dim-strip--bottom"
        style={{ top: `${rect.y + rect.h}px` }}
      />
      <div
        className="dim-strip dim-strip--left"
        style={{
          top: `${rect.y}px`,
          height: `${rect.h}px`,
          width: `${rect.x}px`,
        }}
      />
      <div
        className="dim-strip dim-strip--right"
        style={{
          top: `${rect.y}px`,
          height: `${rect.h}px`,
          left: `${rect.x + rect.w}px`,
        }}
      />
    </>
  );
}

function Guides({ rect }: { rect: Rect }): JSX.Element {
  return (
    <>
      <div className="guide guide--horizontal" style={{ top: `${rect.y}px` }} />
      <div
        className="guide guide--horizontal"
        style={{ top: `${rect.y + rect.h}px` }}
      />
      <div className="guide guide--vertical" style={{ left: `${rect.x}px` }} />
      <div
        className="guide guide--vertical"
        style={{ left: `${rect.x + rect.w}px` }}
      />
    </>
  );
}

/** 선택 사각형 — design-system 캡처 프레임(녹화 영역 테두리와 같은 모양). */
function Selection({ rect }: { rect: Rect }): JSX.Element {
  const style: CSSProperties = { transform: `translate(${rect.x}px, ${rect.y}px)` };
  return (
    <div className="selection" style={style}>
      <CaptureFrame width={rect.w} height={rect.h} />
    </div>
  );
}

function Chip({ rect }: { rect: Rect }): JSX.Element {
  const placement = chipPlacement(rect);
  return (
    <div className="chip tabular" style={placement}>
      <span className="chip__indicator" aria-hidden="true" />
      <span className="chip__primary">
        {Math.round(rect.w)} × {Math.round(rect.h)}
      </span>
      <span className="chip__divider" aria-hidden="true" />
      <span className="chip__secondary">
        {Math.round(rect.x)}, {Math.round(rect.y)}
      </span>
    </div>
  );
}

/** 드래그·확정된 선택 사각형 — 가이드선, 테두리, 크기 칩. */
export function SelectionMarks({ rect }: { rect: Rect }): JSX.Element {
  return (
    <>
      <Guides rect={rect} />
      <Selection rect={rect} />
      <Chip rect={rect} />
    </>
  );
}
