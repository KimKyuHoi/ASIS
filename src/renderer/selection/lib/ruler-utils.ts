import type { Rect } from '../types/selection';

/**
 * 화면 자(측정) 모드 전용 순수 계산 유틸.
 *
 * 룰
 *   - imperative-style.md — 모듈 순수 함수, 명령형 OK.
 *   - null-safety.md — viewport 크기는 호출자가 넘긴다(0 이면 그대로 0). 은폐 없음.
 *   - folder-structure.md — lib/ 는 비즈니스 로직과 무관한 순수 함수. kebab-case.
 */

/** 뷰포트(오버레이 윈도우) 크기. window.innerWidth/Height 를 그대로 전달받는다. */
export type Viewport = {
  w: number;
  h: number;
};

/**
 * 측정 사각형의 각 변에서 화면(뷰포트) 가장자리까지의 거리(CSS px).
 * 값은 항상 0 이상 — 사각형이 뷰포트 안에 있다고 가정한다(오버레이는 풀스크린).
 */
export type EdgeDistances = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export function edgeDistances(rect: Rect, vp: Viewport): EdgeDistances {
  return {
    top: Math.max(0, Math.round(rect.y)),
    left: Math.max(0, Math.round(rect.x)),
    right: Math.max(0, Math.round(vp.w - (rect.x + rect.w))),
    bottom: Math.max(0, Math.round(vp.h - (rect.y + rect.h))),
  };
}

/**
 * "좋은" 눈금 간격을 고른다 — 1·2·5 × 10^n 계열에서 targetPx 근처의 값.
 * 화면 자의 눈금이 너무 촘촘하거나 성기지 않도록 픽셀 밀도를 일정하게 유지한다.
 *
 * @param targetPx 눈금 하나당 목표 픽셀 간격(대략). 이 값에 가장 가까운 1/2/5 계열을 고른다.
 * @returns 최소 1 이상의 정수 간격.
 */
export function niceTickStep(targetPx: number): number {
  if (targetPx <= 1) return 1;
  const exponent = Math.floor(Math.log10(targetPx));
  const base = 10 ** exponent;
  const fraction = targetPx / base;
  // 1·2·5 계열 중 targetPx 를 넘지 않는(또는 근접한) 가장 큰 값.
  let niceFraction: number;
  if (fraction >= 5) niceFraction = 5;
  else if (fraction >= 2) niceFraction = 2;
  else niceFraction = 1;
  return Math.max(1, Math.round(niceFraction * base));
}

/**
 * [start, end) 구간에서 step 간격의 눈금 좌표 배열을 만든다.
 * step 이 0 이하이거나 구간이 비면 빈 배열(무한 루프·과도한 tick 방지).
 *
 * maxTicks 로 상한을 둔다 — 비정상적으로 작은 step 이 들어와도 DOM 노드가
 * 폭발하지 않도록 하는 안전장치.
 */
export function tickPositions(
  start: number,
  end: number,
  step: number,
  maxTicks = 2000,
): number[] {
  if (step <= 0 || end <= start) return [];
  const ticks: number[] = [];
  // start 이상인 첫 번째 step 배수부터 시작.
  const first = Math.ceil(start / step) * step;
  let pos = first;
  while (pos < end && ticks.length < maxTicks) {
    ticks.push(pos);
    pos += step;
  }
  return ticks;
}
