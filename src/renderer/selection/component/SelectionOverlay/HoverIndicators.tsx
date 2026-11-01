import type { CSSProperties, JSX } from 'react';
import { CaptureFrame } from '../../../design-system/component';
import type { HoverElement, SnapWindow } from '../../types/selection';

/**
 * AX RoleDescription 중 사용자에게 정보 가치가 낮은 generic 이름들.
 * 우상단 hover 정보 패널에서 이런 이름은 숨기고 윈도우 owner name 만 표시한다.
 * (예: AXGroup 의 RoleDescription = "그룹" — 사용자에게 무의미.)
 */
const GENERIC_AX_NAMES: ReadonlySet<string> = new Set([
  '그룹', 'Group', '윈도우', 'Window', '리스트', 'List',
  '일반 콘텐트', 'Generic Content', 'AXGroup',
]);

type HoverProps = { hoverElement: HoverElement | null; hoverWindow: SnapWindow | null };

/** 패널에 보여 줄 AX 요소 이름 — 비었거나 generic 이면 null. */
function meaningfulElementName(hoverElement: HoverElement | null): string | null {
  const name = hoverElement?.name ?? '';
  if (name === '' || GENERIC_AX_NAMES.has(name)) return null;
  return name;
}

/**
 * 우상단 hover 정보 패널.
 *   - 1행: 윈도우 owner name (있을 때) — 사용자에게 친숙한 앱 이름
 *   - 2행: AX element name (있을 때, "그룹"·"윈도우" 같은 generic 은 숨김)
 *   - 3행: 실제 잡힌 영역의 w×h — highlight 박스(WindowSnap) 와 같은 영역이라
 *          hoverElement 가 우선, 없으면 hoverWindow. 둘 다 없으면 패널을 안 그린다.
 */
export function HoverInfo({ hoverElement, hoverWindow }: HoverProps): JSX.Element | null {
  const sizeRect = hoverElement ?? hoverWindow;
  if (!sizeRect) return null;
  const elementName = meaningfulElementName(hoverElement);
  return (
    <div className="hover-info">
      {hoverWindow ? <div className="hover-info__name">{hoverWindow.name}</div> : null}
      {elementName === null ? null : <div className="hover-info__element">{elementName}</div>}
      <div className="hover-info__size tabular">
        {Math.round(sizeRect.w)}×{Math.round(sizeRect.h)}
      </div>
    </div>
  );
}

/**
 * UI 자동 감지 — hover 한 요소(우선) 또는 윈도우 윤곽을 캡처 프레임으로 표시.
 * 창은 흰 프레임, 그 안의 UI 요소는 오렌지 프레임. 그 안에 클릭하면 그 영역으로
 * 자동 캡처한다 (Snipaste 결).
 */
export function WindowSnap({ hoverElement, hoverWindow }: HoverProps): JSX.Element | null {
  const rect = hoverElement ?? hoverWindow;
  if (!rect) return null;
  const style: CSSProperties = { transform: `translate(${rect.x}px, ${rect.y}px)` };
  return (
    <div className="snap" style={style}>
      <CaptureFrame width={rect.w} height={rect.h} tone={hoverElement ? 'accent' : 'neutral'} />
    </div>
  );
}
