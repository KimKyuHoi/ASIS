import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { DragAction, DragState, Point, Rect } from '../types/selection';
import { Magnifier } from './Magnifier';
import { normalize, chipPlacement } from '../lib/rect-utils';

/**
 * AX RoleDescription 중 사용자에게 정보 가치가 낮은 generic 이름들.
 * 우상단 hover 정보 패널에서 이런 이름은 숨기고 윈도우 owner name 만 표시한다.
 * (예: AXGroup 의 RoleDescription = "그룹" — 사용자에게 무의미.)
 */
const GENERIC_AX_NAMES: ReadonlySet<string> = new Set([
  '그룹', 'Group', '윈도우', 'Window', '리스트', 'List',
  '일반 콘텐트', 'Generic Content', 'AXGroup',
]);

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
 *   - null-safety.md      window.selection 미존재 시 throw.
 *   - side-effects.md     pointer/keyboard listener 는 window 단위 useEffect cleanup.
 *                         dispatch 는 stable 이라 deps 비움.
 *   - imperative-style.md reducer 안·핸들러 안 명령형 OK. 렌더 path declarative.
 *   - communication-tone.md 한국어 주석 평어. UI 텍스트는 사용자 대상 자연스러운 톤.
 */
export default function SelectionOverlay(): JSX.Element {
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [bgCanvas, setBgCanvas] = useState<HTMLCanvasElement | null>(null);
  const [bgSize, setBgSize] = useState<{ w: number; h: number } | null>(null);
  const [windows, setWindows] = useState<
    Array<{ id: number; name: string; x: number; y: number; w: number; h: number }>
  >([]);
  type HoverElement = { x: number; y: number; w: number; h: number; name?: string };
  const [hoverElement, setHoverElement] = useState<HoverElement | null>(null);
  // pointerdown 시 hit 된 윈도우 후보 — 이동 없이 pointerup 되면(클릭) 그 윈도우를 캡처.
  // 이동이 있으면(드래그) 무시 → 일반 rect 드래그로 전환.
  const pendingWindowHitRef = useRef<{
    id: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const pendingElementHitRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  // AX 쿼리 throttle — 50ms 마다 한 번만 IPC 전송.
  const lastElementQueryRef = useRef<number>(0);
  // 이벤트 핸들러 안에서 최신 hoverElement / state.kind 를 읽기 위한 refs.
  // useEffect deps 를 [windows] 로 고정해 리스너 teardown 레이스를 방지한다.
  const hoverElementRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const stateKindRef = useRef<string>('idle');

  // 최신 값을 이벤트 핸들러가 읽을 수 있도록 렌더 직후 ref 갱신.
  // 렌더 중 ref.current 를 직접 쓰면 react-hooks/refs 룰 위반이므로 useEffect 로 처리.
  useEffect(() => {
    hoverElementRef.current = hoverElement;
    stateKindRef.current = state.kind;
  });

  // main → renderer: visible 윈도우 list. 권한 없으면 빈 배열.
  // onWindows listener 를 attach 한 직후 ready() 호출 — main 이 그 신호를 받은 후
  // windows 데이터를 전송해 레이스 없이 수신한다 (editor:ready 핸드셰이크와 동일).
  useEffect(() => {
    const api = window.selection;
    if (!api) throw new Error('window.selection 미노출 — preload 셋업 확인.');
    const off = api.onWindows((list) => setWindows(list));
    api.ready();
    return off;
  }, []);

  // main → renderer: 화면 background dataURL → hidden canvas 에 그림.
  useEffect(() => {
    const api = window.selection;
    if (!api) throw new Error('window.selection 미노출 — preload 셋업 확인.');
    if (!bgCanvas) return undefined;
    let raf1 = 0;
    let raf2 = 0;
    const off = api.onBackground((dataUrl) => {
      const img = new Image();
      img.onload = (): void => {
        // bgSize state 갱신 → 다음 렌더에 canvas 가 그 크기로 render → 그 다음
        // RAF 에서 drawImage. 두 단계지만 mutation 없이 안전.
        raf1 = requestAnimationFrame(() => {
          setBgSize({ w: img.naturalWidth, h: img.naturalHeight });
          raf2 = requestAnimationFrame(() => {
            const ctx = bgCanvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0);
          });
        });
      };
      img.src = dataUrl;
    });
    return () => {
      off();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [bgCanvas]);
  const bgReady = bgSize !== null;

  // 윈도우 단위 pointer / keyboard listener.
  // element 가 아닌 window 에 붙이는 이유: 마우스가 잠시 윈도우 밖으로 나갔다가
  // 돌아와도 박스 상태가 유지되어야 한다.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      if (e.button === 2) {
        cancel();
        return;
      }
      if (e.button !== 0) return;

      dragStartRef.current = { x: e.clientX, y: e.clientY };

      if (!e.shiftKey) {
        // AX element 가 있으면 우선, 없으면 window hit 으로 fallback.
        pendingElementHitRef.current = hoverElementRef.current;
        const hits = windows.filter(
          (w) =>
            e.clientX >= w.x &&
            e.clientX < w.x + w.w &&
            e.clientY >= w.y &&
            e.clientY < w.y + w.h,
        );
        if (hits.length > 0) {
          hits.sort((a, b) => a.w * a.h - b.w * b.h);
          pendingWindowHitRef.current = hits[0];
        } else {
          pendingWindowHitRef.current = null;
        }
      } else {
        pendingElementHitRef.current = null;
        pendingWindowHitRef.current = null;
      }

      dispatch({ type: 'pointer-down', point: { x: e.clientX, y: e.clientY } });
    };

    const onPointerMove = (e: PointerEvent): void => {
      dispatch({ type: 'pointer-move', point: { x: e.clientX, y: e.clientY } });
      setPointer({ x: e.clientX, y: e.clientY });

      // idle 상태에서만 AX 쿼리 — 드래그 중에는 불필요.
      if (stateKindRef.current !== 'idle') return;
      const now = Date.now();
      if (now - lastElementQueryRef.current < 50) return;
      lastElementQueryRef.current = now;
      window.selection.elementAt(e.clientX, e.clientY).then((el) => {
        setHoverElement(el);
      }).catch(() => {
        setHoverElement(null);
      });
    };

    const onPointerUp = (e: PointerEvent): void => {
      const start = dragStartRef.current;
      const elementHit = pendingElementHitRef.current;
      const windowHit = pendingWindowHitRef.current;
      dragStartRef.current = null;
      pendingElementHitRef.current = null;
      pendingWindowHitRef.current = null;

      if (start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        const isClick = dx * dx + dy * dy < MIN_RECT_SIZE * MIN_RECT_SIZE;
        if (isClick) {
          dispatch({ type: 'pointer-up' });
          // window hit 우선, 없으면 AX element (element 좌표 부정확 시 전체화면 방지).
          const windowTarget = windowHit ? { ...windowHit, windowId: windowHit.id } : null;
          const target = windowTarget ?? elementHit;
          if (target) {
            capture(target);
            return;
          }
          return;
        }
      }

      dispatch({ type: 'pointer-up' });
    };

    const onContextMenu = (e: MouseEvent): void => {
      // 기본 컨텍스트 메뉴 차단 (우클릭 = 취소 트리거).
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  // deps 를 [windows] 로만 제한 — state.kind / hoverElement 변경 때마다
  // 리스너를 해제·재등록하면 pointerdown → pointerup 사이에 teardown 레이스가
  // 발생해 pointerup 이 누락된다. 최신값은 ref 로 읽는다.
  }, [windows]);

  // committed 로 전이되면 commit 펄스 애니메이션이 끝나고 IPC 전송한다.
  // 90ms 는 styles.css 의 selectionCommit 키프레임과 일치.
  useEffect(() => {
    if (state.kind !== 'committed') return undefined;
    const rect = state.rect;
    const handle = window.setTimeout(() => capture(rect), 90);
    return () => window.clearTimeout(handle);
  }, [state]);

  // 마우스 hover 시점의 *작은 hit-target 윈도우* 찾기 (UI 자동 감지).
  // 여러 윈도우가 겹쳐있으면 *가장 작은* 게 사용자가 의도한 윈도우 (Snipaste 결).
  type HoverWindow = { id: number; name: string; x: number; y: number; w: number; h: number };
  const hoverWindow = ((): HoverWindow | null => {
    if (!pointer || windows.length === 0 || state.kind !== 'idle') return null;
    const hits = windows.filter(
      (w) =>
        pointer.x >= w.x &&
        pointer.x < w.x + w.w &&
        pointer.y >= w.y &&
        pointer.y < w.y + w.h,
    );
    if (hits.length === 0) return null;
    // 작은 윈도우 우선 (가장 specific).
    hits.sort((a, b) => a.w * a.h - b.w * b.h);
    return hits[0];
  })();

  const rect = state.kind === 'dragging'
    ? normalize(state.start, state.current)
    : state.kind === 'committed'
      ? state.rect
      : null;

  // dim/캡처는 hoverWindow 우선 — AX element 좌표가 부정확할 때 전체화면 캡처되는 버그 방지.
  // hoverElement 는 WindowSnap 시각 표시에만 사용하고 dim/rect 판단은 window 단위로.
  const snapTarget = state.kind === 'idle' ? (hoverWindow ?? hoverElement) : null;
  const dimRect = rect ?? snapTarget;

  const overlayClass = [
    'overlay',
    state.kind === 'dragging' ? 'overlay--dragging' : '',
    state.kind === 'committed' ? 'overlay--committed' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={overlayClass}>
      {/* 우상단 hover 정보 패널.
          - 1행: 윈도우 owner name (있을 때) — 사용자에게 친숙한 앱 이름
          - 2행: AX element name (있을 때, "그룹"·"윈도우" 같은 generic 은 숨김)
          - 3행: 실제 잡힌 영역의 w×h (hoverElement 가 우선, 없으면 hoverWindow)
          highlight 박스(WindowSnap) 와 같은 영역의 크기를 표시한다. */}
      {state.kind === 'idle' && (() => {
        // 시각 표시(snap) 가 hoverElement 우선이므로 크기도 동일하게.
        // 둘 다 null 이면 패널 자체를 안 그린다.
        const sizeRect = hoverElement ?? hoverWindow;
        if (!sizeRect) return null;
        const elName = hoverElement?.name && hoverElement.name.length > 0
          ? hoverElement.name
          : null;
        const showElName = elName !== null && !GENERIC_AX_NAMES.has(elName);
        return (
          <div className="hover-info">
            {hoverWindow && (
              <div className="hover-info__name">{hoverWindow.name}</div>
            )}
            {showElName && (
              <div className="hover-info__element">{elName}</div>
            )}
            <div className="hover-info__size">
              {Math.round(sizeRect.w)}×{Math.round(sizeRect.h)}
            </div>
          </div>
        );
      })()}
      {dimRect ? <DimStrips rect={dimRect} /> : <div className="dim dim--full" />}

      {rect ? (
        <>
          <Guides rect={rect} />
          <Selection rect={rect} />
          <Chip rect={rect} />
        </>
      ) : null}

      {/* AX element 감지 우선, 없으면 window 단위 fallback. idle 상태에서만 표시 */}
      {state.kind === 'idle' && (hoverElement
        ? <WindowSnap rect={hoverElement} priority />
        : hoverWindow
          ? <WindowSnap rect={hoverWindow} />
          : null)}

      <Hint visible={state.kind === 'idle'} />

      {/* hidden canvas — main 에서 받은 background 캡처. magnifier/color picker 픽셀 source. */}
      <canvas
        ref={setBgCanvas}
        width={bgSize?.w ?? 0}
        height={bgSize?.h ?? 0}
        style={{ display: 'none' }}
      />

      {bgReady && pointer && bgCanvas && state.kind !== 'committed' ? (
        <Magnifier pointer={pointer} bgCanvas={bgCanvas} />
      ) : null}
    </div>
  );
}

/**
 * UI 자동 감지 — hover 한 윈도우 윤곽을 점선 박스로 표시.
 * 사용자가 그 안에 클릭하면 그 영역으로 자동 캡처 (Snipaste 결).
 */
function WindowSnap({
  rect,
  priority = false,
}: {
  rect: { x: number; y: number; w: number; h: number };
  priority?: boolean;
}): JSX.Element {
  const color = priority ? 'rgba(255, 180, 50, 0.9)' : 'rgba(94, 162, 255, 0.85)';
  const style: CSSProperties = {
    position: 'fixed',
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    border: `2px solid ${color}`,
    borderRadius: 4,
    pointerEvents: 'none',
    boxShadow:
      'inset 0 0 0 1px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.08)',
    zIndex: 50,
  };
  return <div style={style} />;
}

// ── sub-components (렌더 path 는 declarative) ─────────────────────────────

function DimStrips({ rect }: { rect: Rect }): JSX.Element {
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

function Selection({ rect }: { rect: Rect }): JSX.Element {
  const style: CSSProperties = {
    transform: `translate(${rect.x}px, ${rect.y}px)`,
    width: `${rect.w}px`,
    height: `${rect.h}px`,
  };
  return (
    <div className="selection" style={style}>
      <span className="corner corner--tl" aria-hidden="true" />
      <span className="corner corner--tr" aria-hidden="true" />
      <span className="corner corner--bl" aria-hidden="true" />
      <span className="corner corner--br" aria-hidden="true" />
    </div>
  );
}

function Chip({ rect }: { rect: Rect }): JSX.Element {
  const placement = chipPlacement(rect);
  return (
    <div className="chip" style={placement}>
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

function Hint({ visible }: { visible: boolean }): JSX.Element {
  return (
    <div className={`hint ${visible ? 'hint--visible' : 'hint--hidden'}`}>
      <kbd className="hint__key">esc</kbd>
      <span className="hint__label">취소</span>
      <span className="hint__divider" aria-hidden="true" />
      <span className="hint__instruction">드래그하여 영역을 선택하세요</span>
    </div>
  );
}

// ── reducer ───────────────────────────────────────────────────────────────

const INITIAL_STATE: DragState = { kind: 'idle' };
const MIN_RECT_SIZE = 6; // 손 떨림 방지 임계값

function reduce(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case 'pointer-down': {
      // 이미 dragging 이면 첫 드래그 유지 (멀티 포인터 무시).
      if (state.kind !== 'idle') return state;
      return {
        kind: 'dragging',
        start: action.point,
        current: action.point,
      };
    }
    case 'pointer-move': {
      if (state.kind !== 'dragging') return state;
      return { ...state, current: action.point };
    }
    case 'pointer-up': {
      if (state.kind !== 'dragging') return state;
      const rect = normalize(state.start, state.current);
      // 너무 작은 영역은 의도하지 않은 클릭이라 idle 로 복귀.
      if (rect.w < MIN_RECT_SIZE || rect.h < MIN_RECT_SIZE) {
        return { kind: 'idle' };
      }
      return { kind: 'committed', rect };
    }
    default: {
      // 새 action type 이 추가되면 컴파일 에러로 알린다.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ── IPC bridge ────────────────────────────────────────────────────────────

function capture(rect: Rect): void {
  const api = window.selection;
  if (!api) {
    throw new Error('window.selection 가 노출되지 않았다 — preload 셋업을 확인할 것.');
  }
  api.capture(rect).catch((err: unknown) => {
    console.error('selection.capture rejected', err);
  });
}

function cancel(): void {
  const api = window.selection;
  if (!api) {
    throw new Error('window.selection 가 노출되지 않았다 — preload 셋업을 확인할 것.');
  }
  api.cancel();
}
