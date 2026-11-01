import { useReducer, useState, type JSX } from 'react';
import type { DragState, HoverElement, Point, Rect, SnapWindow } from '../../types/selection';
import { Magnifier } from '../Magnifier';
import { findSmallestWindowAt } from '../../lib/rect-utils';
import { INITIAL_DRAG_STATE, reduceDrag, selectionRectOf } from '../../lib/selection-reducer';
import { useBackgroundCanvas } from '../../hook/useBackgroundCanvas';
import { useColorCopy } from '../../hook/useColorCopy';
import { useHoverElement } from '../../hook/useHoverElement';
import { useSelectionPointer } from '../../hook/useSelectionPointer';
import { useSnapWindows } from '../../hook/useSnapWindows';
import { DimStrips, SelectionMarks } from './SelectionMarks';
import { HoverInfo, WindowSnap } from './HoverIndicators';
import { CopyToast, Hint } from './OverlayFooter';

type OverlayView = {
  isIdle: boolean;
  hoverWindow: SnapWindow | null;
  rect: Rect | null;
  dimRect: Rect | null;
  overlayClass: string;
};

/** 렌더에 필요한 파생 값 — 순수 계산. */
function deriveOverlayView(
  state: DragState,
  pointer: Point | null,
  hover: { windows: SnapWindow[]; hoverElement: HoverElement | null },
): OverlayView {
  const isIdle = state.kind === 'idle';
  // 마우스 hover 시점의 *작은 hit-target 윈도우* (UI 자동 감지).
  const hoverWindow = isIdle && pointer ? findSmallestWindowAt(hover.windows, pointer) : null;
  const rect = selectionRectOf(state);
  // dim 은 hoverWindow 우선 — AX element 좌표가 부정확할 때 전체화면이 밝아지는 버그 방지.
  // hoverElement 는 WindowSnap 시각 표시·크기 표시에 쓴다.
  const snapTarget = isIdle ? (hoverWindow ?? hover.hoverElement) : null;
  const overlayClass = [
    'overlay',
    state.kind === 'dragging' ? 'overlay--dragging' : '',
    state.kind === 'committed' ? 'overlay--committed' : '',
  ].filter(Boolean).join(' ');
  return { isIdle, hoverWindow, rect, dimRect: rect ?? snapTarget, overlayClass };
}

/**
 * ASIS 영역 선택 오버레이.
 *
 * 풀스크린 transparent BrowserWindow 안에서 동작한다. 사용자 드래그로 사각형을
 * 선택하면 *자기 윈도우 좌표계의 CSS 픽셀 단위* rect 를 IPC 로 전송한다.
 * 다중 모니터 / Retina 변환은 main process 책임이고, 이 컴포넌트는 자기 윈도우
 * 좌표만 다룬다 (관심사 분리).
 *
 * 룰 적용
 *   - react-compiler.md   useMemo/useCallback/memo 미사용 (Compiler 자동).
 *   - side-effects.md     window listener 는 useWindowPointerListeners 의 effect cleanup.
 *   - imperative-style.md reducer 안·핸들러 안 명령형 OK. 렌더 path declarative.
 */
export default function SelectionOverlay(): JSX.Element {
  const [state, dispatch] = useReducer(reduceDrag, INITIAL_DRAG_STATE);
  const [pointer, setPointer] = useState<Point | null>(null);
  const windows = useSnapWindows();
  const {
    setCanvas: setBgCanvas,
    canvas: bgCanvas,
    received: backgroundReceived,
    ready: backgroundReady,
  } = useBackgroundCanvas('selection');
  const { hoverElement, queryAt } = useHoverElement();
  const { copyToast, copyColorAt } = useColorCopy();

  // 세션 활성 여부 — main 은 실제 캡처 세션에만 windows/background 를 보낸다.
  // invisible standby 창은 이 신호를 못 받으므로, 수신 전에는 elementAt IPC 를
  // 보내지 않는다. document.hasFocus() 게이트는 쓰지 않는다 — macOS 26β focus
  // 회귀 시 세션 중에도 false 가 되어 UI 자동감지가 죽는다.
  const activated = windows !== null || backgroundReceived;
  const snapWindows = windows ?? [];

  useSelectionPointer({
    state,
    dispatch,
    windows: snapWindows,
    hoverElement,
    onHover: (point) => {
      // 크로스헤어는 표시 직후부터 따라와야 하므로 게이트하지 않는다.
      setPointer(point);
      // AX 쿼리는 idle·세션 활성일 때만 — 드래그 중엔 불필요하고 standby 의 IPC 스팸을 막는다.
      if (state.kind === 'idle' && activated) queryAt(point);
    },
    onSecondaryClick: (point) => copyColorAt(bgCanvas, point),
  });

  const { isIdle, hoverWindow, rect, dimRect, overlayClass } =
    deriveOverlayView(state, pointer, { windows: snapWindows, hoverElement });
  // 확정(committed) 펄스 중에는 magnifier 를 숨긴다.
  const magnifierPointer = backgroundReady && state.kind !== 'committed' ? pointer : null;

  return (
    <div className={overlayClass}>
      {isIdle ? <HoverInfo hoverElement={hoverElement} hoverWindow={hoverWindow} /> : null}
      {dimRect ? <DimStrips rect={dimRect} /> : <div className="dim dim--full" />}
      {rect ? <SelectionMarks rect={rect} /> : null}
      {/* AX element 감지 우선, 없으면 window 단위 fallback. idle 상태에서만 표시 */}
      {isIdle ? <WindowSnap hoverElement={hoverElement} hoverWindow={hoverWindow} /> : null}
      <Hint visible={isIdle} />
      {/* hidden canvas — main 에서 받은 background 캡처. magnifier/color picker 픽셀 source.
          width/height 는 useBackgroundCanvas 가 명령형으로 관리한다. */}
      <canvas ref={setBgCanvas} style={{ display: 'none' }} />
      {magnifierPointer && bgCanvas ? (
        <Magnifier pointer={magnifierPointer} bgCanvas={bgCanvas} />
      ) : null}
      {copyToast ? <CopyToast hex={copyToast} /> : null}
    </div>
  );
}
