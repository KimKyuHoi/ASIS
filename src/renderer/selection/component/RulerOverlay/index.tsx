import { useEffect, useReducer, useState, type JSX } from 'react';
import type { Point } from '../../types/selection';
import { Magnifier } from '../Magnifier';
import { clientPoint } from '../../lib/rect-utils';
import { INITIAL_RULER_STATE, measureRectOf, reduceRuler } from '../../lib/ruler-reducer';
import { cancelOverlay } from '../../lib/selection-ipc';
import { useBackgroundCanvas } from '../../hook/useBackgroundCanvas';
import { useHoverElement } from '../../hook/useHoverElement';
import { useWindowPointerListeners } from '../../hook/useWindowPointerListeners';
import { RulerMarks } from './RulerMarks';
import { ElementOutline, RulerHint, RulerInfoPanel } from './RulerInfo';

const MOUSE_BUTTON_PRIMARY = 0;

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
 * 캡처·window snap·dock 감지 흐름이 필요 없다. lifecycle 이 달라 분리한다.
 */
export default function RulerOverlay(): JSX.Element {
  const [state, dispatch] = useReducer(reduceRuler, INITIAL_RULER_STATE);
  const [pointer, setPointer] = useState<Point | null>(null);
  const { setCanvas: setBgCanvas, canvas: bgCanvas, ready: backgroundReady } =
    useBackgroundCanvas('ruler');
  const { hoverElement, queryAt } = useHoverElement();

  // ready() 핸드셰이크 — 측정 모드는 window 목록을 쓰지 않지만, 이 신호를 받아야
  // main 이 background 를 다시 보낸다.
  useEffect(() => {
    window.selection.ready();
  }, []);

  useWindowPointerListeners({
    onPointerDown: (e) => {
      // 우클릭·기타 버튼은 무시(측정 모드는 색상 복사 없음). 좌클릭만 드래그 시작.
      if (e.button !== MOUSE_BUTTON_PRIMARY) return;
      dispatch({ type: 'pointer-down', point: clientPoint(e) });
    },
    onPointerMove: (e) => {
      const point = clientPoint(e);
      dispatch({ type: 'pointer-move', point });
      setPointer(point);
      // 드래그 중이 아닐 때만 AX 요소 치수 조회 — 드래그 중에는 측정 사각형이 우선.
      if (state.kind !== 'dragging') queryAt(point);
    },
    onPointerUp: () => dispatch({ type: 'pointer-up' }),
    onKeyDown: (e) => {
      if (e.key !== 'Escape') return;
      // measured 상태에서 ESC 는 먼저 측정 결과만 지우고, 그 다음 ESC 로 창을 닫는다.
      // (한 번의 ESC 로 바로 닫히면 실수로 측정을 날리기 쉬움 — 2단계로 완충.)
      if (state.kind === 'measured') dispatch({ type: 'clear' });
      else cancelOverlay();
    },
  });

  const rect = measureRectOf(state);
  const overlayClass = [
    'overlay',
    'overlay--ruler',
    state.kind === 'dragging' ? 'overlay--dragging' : '',
  ].filter(Boolean).join(' ');
  const magnifierPointer = backgroundReady ? pointer : null;

  return (
    <div className={overlayClass}>
      {/* 우상단 정보 패널 — 측정 사각형이 있으면 그 치수, 없으면 hover 한 AX 요소 치수. */}
      <RulerInfoPanel rect={rect} hoverElement={rect ? null : hoverElement} />

      {/* 측정 사각형이 없을 때: AX 요소 윤곽 표시(치수 감 잡기용). */}
      {!rect && hoverElement ? <ElementOutline rect={hoverElement} /> : null}

      {rect ? <RulerMarks rect={rect} /> : null}

      <RulerHint visible={state.kind !== 'dragging'} measured={state.kind === 'measured'} />

      {/* hidden canvas — main 에서 받은 background. magnifier 픽셀 source.
          width/height 는 useBackgroundCanvas 가 명령형으로 관리한다. */}
      <canvas ref={setBgCanvas} style={{ display: 'none' }} />

      {magnifierPointer && bgCanvas ? (
        <Magnifier pointer={magnifierPointer} bgCanvas={bgCanvas} />
      ) : null}
    </div>
  );
}
