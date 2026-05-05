import { useEffect, useReducer } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { DragAction, DragState, Point, Rect } from './types';

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
export default function App(): JSX.Element {
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);

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
      dispatch({ type: 'pointer-down', point: { x: e.clientX, y: e.clientY } });
    };

    const onPointerMove = (e: PointerEvent): void => {
      dispatch({ type: 'pointer-move', point: { x: e.clientX, y: e.clientY } });
    };

    const onPointerUp = (): void => {
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
  }, []);

  // committed 로 전이되면 commit 펄스 애니메이션이 끝나고 IPC 전송한다.
  // 90ms 는 styles.css 의 selectionCommit 키프레임과 일치.
  useEffect(() => {
    if (state.kind !== 'committed') return undefined;
    const rect = state.rect;
    const handle = window.setTimeout(() => capture(rect), 90);
    return () => window.clearTimeout(handle);
  }, [state]);

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

      <Hint visible={state.kind === 'idle'} />
    </div>
  );
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

function normalize(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

// ── chip 배치 — 화면 가장자리에서 자동 뒤집기 ──────────────────────────────

const CHIP_GAP = 8;
const CHIP_HEIGHT = 28;
const CHIP_WIDTH_ESTIMATE = 220;

function chipPlacement(rect: Rect): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 기본: 박스 우하단 *바깥 아래*
  let left = rect.x + rect.w - CHIP_WIDTH_ESTIMATE;
  let top = rect.y + rect.h + CHIP_GAP;

  // 하단 넘치면 박스 위쪽 바깥, 그것도 안 되면 박스 안쪽 우하단으로 inset.
  if (top + CHIP_HEIGHT > vh) {
    if (rect.y - CHIP_HEIGHT - CHIP_GAP > 0) {
      top = rect.y - CHIP_HEIGHT - CHIP_GAP;
    } else {
      top = rect.y + rect.h - CHIP_HEIGHT - CHIP_GAP;
    }
  }
  // 좌우 clamp.
  left = Math.max(CHIP_GAP, Math.min(left, vw - CHIP_WIDTH_ESTIMATE - CHIP_GAP));

  return { transform: `translate(${left}px, ${top}px)` };
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
