import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { DragAction, DragState, Point, Rect } from '../types/selection';
import { Magnifier } from './Magnifier';
import { normalize, chipPlacement } from '../lib/rect-utils';

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
    Array<{ name: string; x: number; y: number; w: number; h: number }>
  >([]);
  // pointerdown 시 hit 된 윈도우 후보 — 이동 없이 pointerup 되면(클릭) 그 윈도우를 캡처.
  // 이동이 있으면(드래그) 무시 → 일반 rect 드래그로 전환.
  const pendingWindowHitRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // main → renderer: visible 윈도우 list. 권한 없으면 빈 배열.
  // onWindows listener 를 attach 한 직후 ready() 호출 — main 이 그 신호를 받은 후
  // windows 데이터를 전송해 레이스 없이 수신한다 (editor:ready 핸드셰이크와 동일).
  useEffect(() => {
    const api = window.selection;
    if (!api) throw new Error('window.selection 미노출 — preload 셋업 확인.');
    api.onWindows((list) => setWindows(list));
    api.ready();
  }, []);

  // main → renderer: 화면 background dataURL → hidden canvas 에 그림.
  useEffect(() => {
    const api = window.selection;
    if (!api) throw new Error('window.selection 미노출 — preload 셋업 확인.');
    if (!bgCanvas) return undefined;
    let raf1 = 0;
    let raf2 = 0;
    api.onBackground((dataUrl) => {
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
      // 우클릭 = 취소 (macOS 캡처 도구 컨벤션).
      if (e.button === 2) {
        cancel();
        return;
      }
      if (e.button !== 0) return;

      dragStartRef.current = { x: e.clientX, y: e.clientY };

      // UI 자동 감지: hit 윈도우를 *즉시 캡처하지 않고* ref 에 저장.
      // pointerup 에서 이동 거리가 작으면(클릭) hit 윈도우를 캡처하고,
      // 이동이 있으면(드래그) 무시 → 일반 rect 드래그로 자연스럽게 전환.
      if (!e.shiftKey) {
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
        pendingWindowHitRef.current = null;
      }

      dispatch({ type: 'pointer-down', point: { x: e.clientX, y: e.clientY } });
    };

    const onPointerMove = (e: PointerEvent): void => {
      dispatch({ type: 'pointer-move', point: { x: e.clientX, y: e.clientY } });
      setPointer({ x: e.clientX, y: e.clientY });
    };

    const onPointerUp = (e: PointerEvent): void => {
      const start = dragStartRef.current;
      const windowHit = pendingWindowHitRef.current;
      dragStartRef.current = null;
      pendingWindowHitRef.current = null;

      // 이동 거리가 MIN_RECT_SIZE 미만 = 클릭. hit 윈도우가 있으면 그 영역을 캡처.
      // 이동이 충분하면 일반 드래그 rect — reducer 의 committed 전이가 capture 처리.
      if (start && windowHit) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy < MIN_RECT_SIZE * MIN_RECT_SIZE) {
          dispatch({ type: 'pointer-up' }); // reducer → idle
          capture(windowHit);
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
  const hoverWindow = ((): { x: number; y: number; w: number; h: number } | null => {
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

  const overlayClass = [
    'overlay',
    state.kind === 'dragging' ? 'overlay--dragging' : '',
    state.kind === 'committed' ? 'overlay--committed' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={overlayClass}>
      {rect ? <DimStrips rect={rect} /> : <div className="dim dim--full" />}

      {rect ? (
        <>
          <Guides rect={rect} />
          <Selection rect={rect} />
          <Chip rect={rect} />
        </>
      ) : null}

      {hoverWindow ? <WindowSnap rect={hoverWindow} /> : null}

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
}: {
  rect: { x: number; y: number; w: number; h: number };
}): JSX.Element {
  const style: CSSProperties = {
    position: 'fixed',
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    border: '2px dashed rgba(94, 162, 255, 0.85)',
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
