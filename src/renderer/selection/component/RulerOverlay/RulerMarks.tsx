import type { CSSProperties, JSX } from 'react';
import { CaptureFrame } from '../../../design-system/component';
import type { Rect } from '../../types/selection';
import { edgeDistances, niceTickStep, tickPositions } from '../../lib/ruler-utils';

// ── 측정 사각형 주변 표시 (렌더 path 는 declarative) ──────────────────────────

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
        className="ruler-edge__label tabular"
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
        className="ruler-edge__label tabular"
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
        className="ruler-edge__label tabular"
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
        className="ruler-edge__label tabular"
        style={{ top: `${cy}px`, left: `${rect.x + rect.w + d.right / 2}px` }}
      >
        {d.right}
      </div>
    </>
  );
}

/** 눈금 하나당 목표 픽셀 간격 — 이 근처의 1/2/5 계열로 스냅. */
const TARGET_TICK_PX = 56;
/** major tick(긴 눈금 + 라벨) 주기. */
const MAJOR_TICK_EVERY = 5;

/** 한 축의 눈금들. x 축은 left, y 축은 top 으로 위치를 잡는다. */
function TickMarks({ axis, length, step }: {
  axis: 'x' | 'y';
  length: number;
  step: number;
}): JSX.Element[] {
  return tickPositions(Math.round(length), step).map((v) => {
    const major = v % (step * MAJOR_TICK_EVERY) === 0;
    const position: CSSProperties = axis === 'x' ? { left: `${v}px` } : { top: `${v}px` };
    return (
      <span
        key={v}
        className={`ruler-tick ruler-tick--${axis} ${major ? 'ruler-tick--major' : ''}`}
        style={position}
      >
        {major && v > 0 ? <span className="ruler-tick__num">{v}</span> : null}
      </span>
    );
  });
}

/**
 * 측정 사각형의 상단(가로 눈금)·좌측(세로 눈금)에 자 눈금을 그린다.
 * 눈금 값은 사각형 좌상단(0,0) 기준 상대 오프셋(px).
 */
function RulerTicks({ rect }: { rect: Rect }): JSX.Element {
  const step = niceTickStep(TARGET_TICK_PX);
  return (
    <>
      {/* 상단 가로 눈금 */}
      <div
        className="ruler-scale ruler-scale--top"
        style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px` }}
      >
        <TickMarks axis="x" length={rect.w} step={step} />
      </div>

      {/* 좌측 세로 눈금 */}
      <div
        className="ruler-scale ruler-scale--left"
        style={{ left: `${rect.x}px`, top: `${rect.y}px`, height: `${rect.h}px` }}
      >
        <TickMarks axis="y" length={rect.h} step={step} />
      </div>
    </>
  );
}

/** 측정 영역 박스 — 캡처 프레임 모양, 캡처와 구분되는 측정 파랑(measure). */
function MeasureBox({ rect }: { rect: Rect }): JSX.Element {
  const style: CSSProperties = { transform: `translate(${rect.x}px, ${rect.y}px)` };
  return (
    <div className="measure" style={style}>
      <CaptureFrame width={rect.w} height={rect.h} tone="measure" />
    </div>
  );
}

/** 측정 영역 중앙의 w×h 라벨. */
function MeasureLabel({ rect }: { rect: Rect }): JSX.Element {
  const style: CSSProperties = {
    left: `${rect.x + rect.w / 2}px`,
    top: `${rect.y + rect.h / 2}px`,
  };
  return (
    <div className="measure-label tabular" style={style}>
      <span className="measure-label__dim">{Math.round(rect.w)}</span>
      <span className="measure-label__x" aria-hidden="true">×</span>
      <span className="measure-label__dim">{Math.round(rect.h)}</span>
    </div>
  );
}

/** 측정 사각형 — 가장자리 거리, 눈금, 박스, 치수 라벨. */
export function RulerMarks({ rect }: { rect: Rect }): JSX.Element {
  return (
    <>
      <EdgeMeasures rect={rect} />
      <RulerTicks rect={rect} />
      <MeasureBox rect={rect} />
      <MeasureLabel rect={rect} />
    </>
  );
}
