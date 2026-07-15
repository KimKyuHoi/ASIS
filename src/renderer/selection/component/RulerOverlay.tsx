import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { useLanguage } from '../../../shared/i18n/use-language';
import type { Point, Rect, RulerAction, RulerState } from '../types/selection';
import { Magnifier } from './Magnifier';
import { normalize } from '../lib/rect-utils';
import { edgeDistances, niceTickStep, tickPositions } from '../lib/ruler-utils';
import { paintBackground } from '../lib/paint-background';
import { selectionStrings } from '../lib/strings';

/**
 * 화면 자 / 간격 측정 오버레이(측정 전용).
 *
 * 기존 SelectionOverlay 와 같은 풀스크린 transparent BrowserWindow·같은
 * window.selection IPC 브릿지를 재사용하되, *캡처하지 않는다*. 대신:
 *   - 드래그(또는 고정된 측정 사각형)의 상하좌우 화면 가장자리까지 거리(px) 표시
 *   - 측정 사각형 위/왼쪽 눈금(ruler tick) 표시
 *   - AX 요소 hover 시 그 요소 bounds 치수(w×h) 표시
 *   - ESC 로 닫기. 다시 드래그하면 새 측정으로 교체.
 *
 * 왜 별도 컴포넌트인가: 캡처 오버레이는 pointer-up → commit 펄스 → IPC 전송 →
 * 윈도우 close 로 짧게 살고 사라진다. 측정 오버레이는 measured 상태를 계속 유지하며
 * 캡처·window snap·dock 감지 흐름이 필요 없다. lifecycle 이 달라 분리한다
 * (side-effects.md / folder-structure.md).
 *
 * 룰 적용
 *   - react-compiler.md   useMemo/useCallback/memo 미사용.
 *   - null-safety.md      window.selection 미존재 시 throw. 빈 catch 없음.
 *   - side-effects.md     pointer/keyboard listener 는 window 단위 useEffect cleanup.
 *   - imperative-style.md reducer·핸들러 안 명령형 OK. 렌더 path declarative.
 *   - communication-tone.md 한국어 주석 평어.
 */
export default function RulerOverlay(): JSX.Element {
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [bgCanvas, setBgCanvas] = useState<HTMLCanvasElement | null>(null);
  const [bgSize, setBgSize] = useState<{ w: number; h: number } | null>(null);
  type HoverElement = { x: number; y: number; w: number; h: number; name?: string };
  const [hoverElement, setHoverElement] = useState<HoverElement | null>(null);

  // AX 쿼리 throttle — 50ms 마다 한 번만 IPC 전송(캡처 오버레이와 동일 간격).
  const lastElementQueryRef = useRef<number>(0);
  // 이벤트 핸들러가 최신 state.kind 를 읽기 위한 ref — 리스너 deps 를 비워
  // pointerdown↔pointerup teardown 레이스를 방지한다(캡처 오버레이와 동일 전략).
  const stateKindRef = useRef<string>('idle');

  useEffect(() => {
    stateKindRef.current = state.kind;
  });

  // main → renderer: 화면 background dataURL → hidden canvas. Magnifier 픽셀 source.
  // onWindows 는 측정 모드에서 불필요(window snap 안 함)하지만 ready() 핸드셰이크는
  // 유지해야 main 이 background 를 전송한다.
  useEffect(() => {
    const api = window.selection;
    if (!api) throw new Error('window.selection 미노출 — preload 셋업 확인.');
    // window 목록은 측정 모드에서 쓰지 않지만, 구독 없이 ready() 만 보내면
    // main 이 onWindows attach 신호로 오해하지 않도록 background 만 구독한다.
    api.ready();
  }, []);

  // 도착 즉시 hidden canvas 에 그림 — SelectionOverlay 와 동일 구조
  // (paint-background.ts 공용, canvas 크기는 명령형 관리).
  useEffect(() => {
    const api = window.selection;
    if (!api) throw new Error('window.selection 미노출 — preload 셋업 확인.');
    if (!bgCanvas) return undefined;
    let stale = false;
    const off = api.onBackground((payload) => {
      paintBackground(bgCanvas, payload)
        .then((size) => {
          if (!stale) setBgSize(size);
        })
        .catch((err: unknown) => {
          // background 실패 시 magnifier 만 비활성 — 측정 UX 는 계속 동작한다.
          console.warn('[asis ruler] background 그리기 실패:', err);
        });
    });
    return () => {
      stale = true;
      off();
    };
  }, [bgCanvas]);
  const bgReady = bgSize !== null;

  // 윈도우 단위 pointer / keyboard listener.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      // 우클릭·기타 버튼은 무시(측정 모드는 색상 복사 없음). 좌클릭만 드래그 시작.
      if (e.button !== 0) return;
      dispatch({ type: 'pointer-down', point: { x: e.clientX, y: e.clientY } });
    };

    const onPointerMove = (e: PointerEvent): void => {
      dispatch({ type: 'pointer-move', point: { x: e.clientX, y: e.clientY } });
      setPointer({ x: e.clientX, y: e.clientY });

      // 드래그 중이 아닐 때만 AX 요소 치수 조회 — 드래그 중에는 측정 사각형이 우선.
      if (stateKindRef.current === 'dragging') return;
      const now = Date.now();
      if (now - lastElementQueryRef.current < 50) return;
      lastElementQueryRef.current = now;
      window.selection.elementAt(e.clientX, e.clientY).then((el) => {
        setHoverElement(el);
      }).catch(() => {
        setHoverElement(null);
      });
    };

    const onPointerUp = (): void => {
      dispatch({ type: 'pointer-up' });
    };

    const onContextMenu = (e: MouseEvent): void => {
      // 기본 컨텍스트 메뉴 차단.
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // measured 상태에서 ESC 는 먼저 측정 결과만 지우고, 그 다음 ESC 로 창을 닫는다.
      // (한 번의 ESC 로 바로 닫히면 실수로 측정을 날리기 쉬움 — 2단계로 완충.)
      if (stateKindRef.current === 'measured') {
        dispatch({ type: 'clear' });
        return;
      }
      cancel();
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
    // deps 비움 — dispatch 는 stable, 최신 state.kind 는 ref 로 읽는다.
  }, []);

  const rect = state.kind === 'dragging'
    ? normalize(state.start, state.current)
    : state.kind === 'measured'
      ? state.rect
      : null;

  const overlayClass = [
    'overlay',
    'overlay--ruler',
    state.kind === 'dragging' ? 'overlay--dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={overlayClass}>
      {/* 우상단 정보 패널 — 측정 사각형이 있으면 그 치수, 없으면 hover 한 AX 요소 치수. */}
      <RulerInfoPanel rect={rect} hoverElement={rect ? null : hoverElement} />

      {/* 측정 사각형이 없을 때: AX 요소 윤곽 표시(치수 감 잡기용). */}
      {!rect && hoverElement ? <ElementOutline rect={hoverElement} /> : null}

      {rect ? (
        <>
          <EdgeMeasures rect={rect} />
          <RulerTicks rect={rect} />
          <MeasureBox rect={rect} />
          <MeasureLabel rect={rect} />
        </>
      ) : null}

      <Hint visible={rect === null} measured={state.kind === 'measured'} />

      {/* hidden canvas — main 에서 받은 background. magnifier 픽셀 source.
          width/height 는 onBackground 콜백이 명령형으로 관리 — JSX prop 으로 두면
          재렌더 시 attribute 재설정으로 그려 둔 픽셀이 지워진다. */}
      <canvas ref={setBgCanvas} style={{ display: 'none' }} />

      {bgReady && pointer && bgCanvas ? (
        <Magnifier pointer={pointer} bgCanvas={bgCanvas} />
      ) : null}
    </div>
  );
}

// ── sub-components (렌더 path 는 declarative) ─────────────────────────────

/**
 * 상하좌우 화면 가장자리까지의 거리 표시.
 * 각 방향으로 사각형 중심에서 화면 끝까지 이어지는 dashed line + 거리 라벨(px).
 */
function EdgeMeasures({ rect }: { rect: Rect }): JSX.Element {
  const vp = { w: window.innerWidth, h: window.innerHeight };
  const d = edgeDistances(rect, vp);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  return (
    <>
      {/* 위쪽: 사각형 상단 중앙 ↑ 화면 top */}
      <div
        className="ruler-edge ruler-edge--v"
        style={{ left: `${cx}px`, top: 0, height: `${rect.y}px` }}
      />
      <div
        className="ruler-edge__label"
        style={{ left: `${cx}px`, top: `${rect.y / 2}px` }}
      >
        {d.top}
      </div>

      {/* 아래쪽: 사각형 하단 중앙 ↓ 화면 bottom */}
      <div
        className="ruler-edge ruler-edge--v"
        style={{ left: `${cx}px`, top: `${rect.y + rect.h}px`, height: `${d.bottom}px` }}
      />
      <div
        className="ruler-edge__label"
        style={{ left: `${cx}px`, top: `${rect.y + rect.h + d.bottom / 2}px` }}
      >
        {d.bottom}
      </div>

      {/* 왼쪽: 사각형 좌측 중앙 ← 화면 left */}
      <div
        className="ruler-edge ruler-edge--h"
        style={{ top: `${cy}px`, left: 0, width: `${rect.x}px` }}
      />
      <div
        className="ruler-edge__label"
        style={{ top: `${cy}px`, left: `${rect.x / 2}px` }}
      >
        {d.left}
      </div>

      {/* 오른쪽: 사각형 우측 중앙 → 화면 right */}
      <div
        className="ruler-edge ruler-edge--h"
        style={{ top: `${cy}px`, left: `${rect.x + rect.w}px`, width: `${d.right}px` }}
      />
      <div
        className="ruler-edge__label"
        style={{ top: `${cy}px`, left: `${rect.x + rect.w + d.right / 2}px` }}
      >
        {d.right}
      </div>
    </>
  );
}

const TARGET_TICK_PX = 56; // 눈금 하나당 목표 픽셀 간격 — 이 근처의 1/2/5 계열로 스냅.
const MAJOR_TICK_EVERY = 5; // major tick(긴 눈금 + 라벨) 주기.

/**
 * 측정 사각형의 상단(가로 눈금)·좌측(세로 눈금)에 자 눈금을 그린다.
 * 눈금 값은 사각형 좌상단(0,0) 기준 상대 오프셋(px).
 */
function RulerTicks({ rect }: { rect: Rect }): JSX.Element {
  const step = niceTickStep(TARGET_TICK_PX);
  const xs = tickPositions(0, Math.round(rect.w), step);
  const ys = tickPositions(0, Math.round(rect.h), step);

  return (
    <>
      {/* 상단 가로 눈금 */}
      <div
        className="ruler-scale ruler-scale--top"
        style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px` }}
      >
        {xs.map((v) => {
          const major = v % (step * MAJOR_TICK_EVERY) === 0;
          return (
            <span
              key={v}
              className={`ruler-tick ruler-tick--x ${major ? 'ruler-tick--major' : ''}`}
              style={{ left: `${v}px` }}
            >
              {major && v > 0 ? <span className="ruler-tick__num">{v}</span> : null}
            </span>
          );
        })}
      </div>

      {/* 좌측 세로 눈금 */}
      <div
        className="ruler-scale ruler-scale--left"
        style={{ left: `${rect.x}px`, top: `${rect.y}px`, height: `${rect.h}px` }}
      >
        {ys.map((v) => {
          const major = v % (step * MAJOR_TICK_EVERY) === 0;
          return (
            <span
              key={v}
              className={`ruler-tick ruler-tick--y ${major ? 'ruler-tick--major' : ''}`}
              style={{ top: `${v}px` }}
            >
              {major && v > 0 ? <span className="ruler-tick__num">{v}</span> : null}
            </span>
          );
        })}
      </div>
    </>
  );
}

/** 측정 영역 박스 — 캡처 selection 과 구분되는 측정 전용 배색(accent 테두리). */
function MeasureBox({ rect }: { rect: Rect }): JSX.Element {
  const style: CSSProperties = {
    transform: `translate(${rect.x}px, ${rect.y}px)`,
    width: `${rect.w}px`,
    height: `${rect.h}px`,
  };
  return <div className="measure-box" style={style} />;
}

/** 측정 영역 중앙의 w×h 라벨. */
function MeasureLabel({ rect }: { rect: Rect }): JSX.Element {
  const style: CSSProperties = {
    left: `${rect.x + rect.w / 2}px`,
    top: `${rect.y + rect.h / 2}px`,
  };
  return (
    <div className="measure-label" style={style}>
      <span className="measure-label__dim">{Math.round(rect.w)}</span>
      <span className="measure-label__x" aria-hidden="true">×</span>
      <span className="measure-label__dim">{Math.round(rect.h)}</span>
    </div>
  );
}

/** AX 요소 윤곽 — 측정 사각형이 없을 때 hover 요소의 bounds 를 점선으로 표시. */
function ElementOutline({
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
    border: '1.5px dashed rgba(255, 180, 50, 0.9)',
    borderRadius: 3,
    pointerEvents: 'none',
    zIndex: 40,
  };
  return <div style={style} />;
}

/**
 * 우상단 정보 패널.
 *  - rect 있음: 측정 사각형의 w×h + 좌상단 좌표
 *  - hoverElement 있음: AX 요소 이름(있으면) + w×h
 */
function RulerInfoPanel({
  rect,
  hoverElement,
}: {
  rect: Rect | null;
  hoverElement: { x: number; y: number; w: number; h: number; name?: string } | null;
}): JSX.Element | null {
  const t = selectionStrings[useLanguage()];
  if (rect) {
    return (
      <div className="hover-info">
        <div className="hover-info__name">{t.rulerLabel}</div>
        <div className="hover-info__size">
          {Math.round(rect.w)} × {Math.round(rect.h)} px
        </div>
        <div className="hover-info__size">
          @ {Math.round(rect.x)}, {Math.round(rect.y)}
        </div>
      </div>
    );
  }
  if (hoverElement) {
    const name = hoverElement.name && hoverElement.name.length > 0 ? hoverElement.name : null;
    return (
      <div className="hover-info">
        {name ? <div className="hover-info__name">{name}</div> : null}
        <div className="hover-info__size">
          {Math.round(hoverElement.w)} × {Math.round(hoverElement.h)} px
        </div>
      </div>
    );
  }
  return null;
}

function Hint({ visible, measured }: { visible: boolean; measured: boolean }): JSX.Element {
  const t = selectionStrings[useLanguage()];
  return (
    <div className={`hint ${visible || measured ? 'hint--visible' : 'hint--hidden'}`}>
      <kbd className="hint__key">esc</kbd>
      <span className="hint__label">{measured ? t.rulerClear : t.rulerClose}</span>
      <span className="hint__divider" aria-hidden="true" />
      <span className="hint__instruction">{t.rulerHint}</span>
    </div>
  );
}

// ── reducer ───────────────────────────────────────────────────────────────

const INITIAL_STATE: RulerState = { kind: 'idle' };
const MIN_RECT_SIZE = 4; // 손 떨림 방지 임계값(측정은 캡처보다 살짝 관대).

function reduce(state: RulerState, action: RulerAction): RulerState {
  switch (action.type) {
    case 'pointer-down': {
      // 새 드래그는 언제나 새 측정으로 교체(measured 상태여도 다시 그릴 수 있음).
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
      // 너무 작은 영역은 클릭으로 보고 측정을 확정하지 않는다 — idle 로 복귀.
      if (rect.w < MIN_RECT_SIZE || rect.h < MIN_RECT_SIZE) {
        return { kind: 'idle' };
      }
      return { kind: 'measured', rect };
    }
    case 'clear': {
      return { kind: 'idle' };
    }
    default: {
      // 새 action type 추가 시 컴파일 에러로 알린다.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ── IPC bridge ────────────────────────────────────────────────────────────

function cancel(): void {
  const api = window.selection;
  if (!api) {
    throw new Error('window.selection 가 노출되지 않았다 — preload 셋업을 확인할 것.');
  }
  api.cancel();
}
