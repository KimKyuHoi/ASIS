import { coarseRowCost, rowCost, type RowInfo } from './rowProfile';

export { computeRowInfo, type Frame, type RowInfo } from './rowProfile';

/**
 * 스크롤 캡처 매칭 — 연속 두 프레임 사이에서 콘텐츠가 얼마나 위로 이동했는지 찾는다.
 *
 * electron 을 import 하지 않는 순수 함수(디코드/인코드는 frameIo.ts, 이음 누적·합성은
 * scrollStitcher.ts, 행 요약은 rowProfile.ts).
 *
 * 알고리즘
 *   1. 행 프로필(칸 밝기 평균) 의 같은 y 끼리 차이가 작게 위/아래로 이어지면 고정 헤더/푸터.
 *   2. 이동량 d 마다 "B 의 y행 ≈ A 의 y+d 행" 비용(평균 칸 차이) 을 내용 있는 행에서만 잰다.
 *      거친 칸(16) 으로 전 범위를 훑어 후보 최소점들을 고르고, 정밀 칸(128) 으로 주변을 확정한다.
 *   3. 최소 비용이 절대 기준 이하이고, 전체 비용 분포(중앙값) 보다 뚜렷하게 낮아야 채택한다 —
 *      반복 패턴·빈 화면에서 아무 d 나 고르지 않기 위해서다.
 *   4. 프레임은 직전에 채택한 프레임과 비교한다(누적 결과 전체와 비교하지 않음).
 */

/** 같은 행으로 볼 최대 평균 칸 차이. */
const ROW_SAME_COST = 4;
/** 이 비율 이상의 행이 같으면 "변하지 않음". 스피너 같은 작은 움직임은 허용. */
export const SAME_FRAME_RATIO = 0.9;

/** 같은 y 끼리 [lo, hi) 의 "같은 행" 비율. 내용 있는 행이 없으면 1(빈 화면 = 같음). */
function sameRatioIn(a: RowInfo, b: RowInfo, range: { lo: number; hi: number }): number {
  if (a.height !== b.height || a.width !== b.width) return 0;
  let same = 0;
  let total = 0;
  for (let y = range.lo; y < range.hi; y++) {
    if (a.detailed[y] === 0 && b.detailed[y] === 0) continue;
    total++;
    if (rowCost(a, b, { ya: y, yb: y }) <= ROW_SAME_COST) same++;
  }
  return total === 0 ? 1 : same / total;
}

/** 같은 y 끼리의 일치율 — 0..1. "변하지 않았는지" 판정. */
export function sameRowRatio(a: RowInfo, b: RowInfo): number {
  return sameRatioIn(a, b, { lo: 0, hi: a.height });
}

/** 고정 헤더/푸터를 뺀 본문 구간에서 같은 y 끼리의 일치율. */
export function bodySameRatio(a: RowInfo, b: RowInfo, st: { top: number; bottom: number }): number {
  const lo = st.top;
  const hi = a.height - st.bottom;
  if (hi <= lo) return 1;
  return sameRatioIn(a, b, { lo, hi });
}

/** 고정 헤더/푸터 후보 — 같은 y 에서 위/아래로 연속 같은 행 수. 각각 높이의 40% 상한. */
export function measureStatic(a: RowInfo, b: RowInfo): { top: number; bottom: number } {
  const h = a.height;
  const cap = Math.floor(h * 0.4);
  const same = (y: number): boolean => rowCost(a, b, { ya: y, yb: y }) <= ROW_SAME_COST;
  let top = 0;
  while (top < cap && same(top)) top++;
  let bottom = 0;
  while (bottom < cap && same(h - 1 - bottom)) bottom++;
  return { top, bottom };
}

export type ShiftResult = {
  /** 콘텐츠가 위로 이동한 픽셀. B 의 y행 ≈ A 의 (y + shift)행. */
  shift: number;
  /** 겹침 구간의 평균 칸 차이(낮을수록 잘 맞음). */
  cost: number;
};

export type FindShiftOptions = {
  /** 비교에서 제외할 상단 행(고정 헤더). */
  top: number;
  /** 비교에서 제외할 하단 행(고정 푸터). */
  bottom: number;
};

/**
 * 채택 최대 평균 칸 차이. 실측: 진짜 이동량의 비용은 관성 스크롤 중에도 0.00~0.1. 비슷한
 * 텍스트 줄끼리의 가짜 정합은 그보다 훨씬 크지만 7 기준은 통과해 위로 되돌린 구간이 중복됐다.
 */
const MAX_MATCH_COST = 3;
/** 최소 비용이 전체 비용 중앙값의 이 비율 이하여야 "뚜렷한" 최소다. */
const DISTINCT_RATIO = 0.35;
/**
 * 행 하나의 비용 상한 — 겹침 안의 애니메이션(GIF·영상) 행이 평균을 끌어올려 진짜 이동량이
 * 기준을 넘지 않게 한다.
 */
const ROW_COST_CAP = 8;
/** 정지 판정 — 행 비용의 이 백분위가 STILL_ROW_COST 이하이면 안 움직임. */
const STILL_PERCENTILE = 0.5;
const STILL_ROW_COST = 1;
/** 겹침이 이 행 수보다 작으면 비교하지 않는다. */
const MIN_OVERLAP_ROWS = 24;
/**
 * 겹침이 프레임 높이의 이 비율보다 작은 후보도 보지 않는다 — 겹침이 아주 얇은 위치의 우연한
 * 정합을 막는다. 실측에서 본 가짜 정합(96행, 7.6%) 은 열 잠금 전 사이드바가 섞인 탓이었고 그건
 * 따로 고쳤다. 높게(20%) 두면 초속 8000px 플릭의 진짜 큰 이동까지 막혀 끊김이 늘었다.
 */
const MIN_OVERLAP_RATIO = 0.06;
/** 근거로 삼을 내용 있는 행의 최소 수(정밀 평가 기준). */
const MIN_DETAILED_ROWS = 12;
const COARSE_STEP = 4;
const CANDIDATES = 6;
const REFINE_RADIUS = COARSE_STEP;

type Range = { lo: number; hi: number };

/** d 에서의 평균 비용. 내용 있는 행이 모자라면 null. */
function shiftCost(
  a: RowInfo,
  b: RowInfo,
  at: { d: number; range: Range; coarse: boolean },
): number | null {
  const step = at.coarse ? COARSE_STEP : 1;
  const cost = at.coarse ? coarseRowCost : rowCost;
  let sum = 0;
  let n = 0;
  for (let y = at.range.lo; y < at.range.hi - at.d; y += step) {
    if (b.detailed[y] === 0 && a.detailed[y + at.d] === 0) continue;
    sum += Math.min(ROW_COST_CAP, cost(a, b, { ya: y + at.d, yb: y }));
    n++;
  }
  const minRows = at.coarse ? Math.ceil(MIN_DETAILED_ROWS / COARSE_STEP) : MIN_DETAILED_ROWS;
  return n < minRows ? null : sum / n;
}

/** 거친 비용 곡선에서 낮은 순으로 국소 최소점 d 들. */
function coarseCandidates(costs: (number | null)[]): number[] {
  const mins: { d: number; c: number }[] = [];
  for (let d = 0; d < costs.length; d++) {
    const c = costs[d];
    if (c === null) continue;
    const prev = d > 0 ? costs[d - 1] : null;
    const left = prev ?? Number.POSITIVE_INFINITY;
    const next = d + 1 < costs.length ? costs[d + 1] : null;
    const right = next ?? Number.POSITIVE_INFINITY;
    if (c <= left && c <= right) mins.push({ d, c });
  }
  mins.sort((p, q) => p.c - q.c);
  return mins.slice(0, CANDIDATES).map((m) => m.d);
}

function median(values: number[]): number {
  const sorted = [...values].sort((p, q) => p - q);
  return sorted[Math.floor(sorted.length / 2)];
}

/** 후보 주변을 정밀 비용으로 훑어 최적 d. */
function refine(
  a: RowInfo,
  b: RowInfo,
  ctx: { candidates: number[]; range: Range; maxShift: number },
): ShiftResult | null {
  let best: ShiftResult | null = null;
  for (const c of ctx.candidates) {
    const from = Math.max(0, c - REFINE_RADIUS);
    const to = Math.min(ctx.maxShift, c + REFINE_RADIUS);
    for (let d = from; d <= to; d++) {
      const cost = shiftCost(a, b, { d, range: ctx.range, coarse: false });
      // 동률이면 작은 d(겹침이 큰 쪽) — 반복 패턴에서 근거가 더 많다.
      if (cost !== null && (best === null || cost < best.cost)) best = { shift: d, cost };
    }
  }
  return best;
}

/**
 * 같은 자리(이동량 0) 비교 비용이 정합 기준 이하인지 — 화면 속 애니메이션 때문에 "같은 프레임"
 * 판정(행 90% 일치) 은 못 받았지만 실제로는 안 움직인 프레임. 실측: 맨 위의 GIF 캔버스가
 * 잘린 열 범위의 큰 비중을 차지하자, 멈춘 화면이 어느 방향으로도 안 맞아 끊김으로 쌓였다.
 */
export function isStill(a: RowInfo, b: RowInfo): boolean {
  if (a.height !== b.height || a.width !== b.width) return false;
  // 고정 영역을 빼지 않고 전체 행으로 본다 — 빼면 남는 구간이 좁고 비어 있을 때 움직인 화면도
  // 비용이 낮게 나온다(실측: 880px 올라간 첫 단계를 정지로 판정).
  const costs: number[] = [];
  for (let y = 0; y < a.height; y++) {
    if (a.detailed[y] === 0 && b.detailed[y] === 0) continue;
    costs.push(rowCost(a, b, { ya: y, yb: y }));
  }
  if (costs.length < MIN_DETAILED_ROWS) return true;
  costs.sort((p, q) => p - q);
  // 평균이 아니라 중앙값 — 애니메이션 행(내용 있는 행의 절반 미만) 은 무시하되, 2~4px 의 작은 실제 이동은
  // 대부분의 글자 행 비용을 올리므로 정지로 보지 않는다(평균 기준일 때 작은 이동을 놓쳐
  // 결과가 126px 짧아졌다 — 실측).
  return costs[Math.floor(costs.length * STILL_PERCENTILE)] <= STILL_ROW_COST;
}

/**
 * A(이전) → B(다음) 사이에서 콘텐츠가 위로 이동한 양을 찾는다. 못 찾으면 null.
 * shift 0 도 후보다 — 화면 속 애니메이션 때문에 "같은 프레임" 판정을 못 받은 정지 프레임이
 * 인접 행끼리 비슷하다는 이유로 d=1~2 에 가짜로 맞는 것을 막는다(실측: 애니메이션이 있는
 * 정지 화면에서 1~2px 짜리 가짜 이음이 쌓였다). shift 0 이면 호출측은 "안 움직임" 으로 본다.
 */
export function findShift(a: RowInfo, b: RowInfo, opts: FindShiftOptions): ShiftResult | null {
  if (a.height !== b.height || a.width !== b.width) return null;
  const range = { lo: opts.top, hi: a.height - opts.bottom };
  const minOverlap = Math.max(MIN_OVERLAP_ROWS, Math.floor(a.height * MIN_OVERLAP_RATIO));
  const maxShift = range.hi - range.lo - minOverlap;
  if (maxShift < 1) return null;
  const costs: (number | null)[] = [];
  for (let d = 0; d <= maxShift; d++) costs.push(shiftCost(a, b, { d, range, coarse: true }));
  const valid = costs.filter((c): c is number => c !== null);
  if (valid.length === 0) return null;
  const best = refine(a, b, { candidates: coarseCandidates(costs), range, maxShift });
  if (!best || best.cost > MAX_MATCH_COST) return null;
  // 거친 비용(칸이 넓어 평균이 뭉개짐) 과 정밀 비용은 척도가 비슷하다 — 중앙값 대비 뚜렷한지 본다.
  if (best.cost > median(valid) * DISTINCT_RATIO) return null;
  return best;
}
