/**
 * 행 프로필 — 각 행을 BINS 칸 밝기 평균으로 요약한다. 매칭(scrollStitch.ts) 은 전부 이 위에서 돈다.
 *
 * 정확 해시를 쓰지 않는 이유(실측): 관성 스크롤 도중 Chromium 은 소수점 위치에서 그리므로
 * 같은 내용이라도 픽셀 값이 조금씩 달라진다 — 진짜 이동량에서도 정확 일치율이 0.6~0.9 에
 * 그쳐 이음이 자주 실패했다. 밝기 평균의 차이(SAD) 는 서브픽셀 차이·화면 속 작은 애니메이션
 * (스피너·GIF) 이 있어도 진짜 이동량에서 최소가 된다.
 *
 * 룰: imperative-style.md — 픽셀 루프 명령형. null-safety.md — 크기 불일치 명시 throw.
 */

/** 한 프레임의 디코드된 raw 픽셀. buf.length === width * height * 4. */
export type Frame = {
  width: number;
  height: number;
  /** raw bitmap. 채널 순서(BGRA/RGBA) 는 read/write 가 대칭이라 무관 — 그대로 복사. */
  buf: Buffer;
};

/** 행당 정밀 칸 수 / 거친 칸 수(정밀 칸 FINE_PER_COARSE 개의 평균). */
export const BINS = 128;
export const COARSE_BINS = 16;
const FINE_PER_COARSE = BINS / COARSE_BINS;
const CHANNELS = 4;
/** 한 칸 차이의 상한 — 애니메이션 칸 하나가 행 비용을 독차지하지 않게. */
const BIN_DIFF_CAP = 32;
/** 행 안 이웃 칸 차이 합이 이보다 작으면 "빈 행"(여백) — 매칭 근거로 쓰지 않는다. */
const DETAIL_MIN = 24;

export type RowInfo = {
  width: number;
  height: number;
  /** [y * BINS + k] 칸 밝기 평균(0..255). */
  fine: Uint8Array;
  /** [y * COARSE_BINS + k] 거친 칸 밝기 평균. */
  coarse: Uint8Array;
  /** 1 = 내용이 있는 행(매칭 근거). */
  detailed: Uint8Array;
};

/**
 * 좌우 제외 폭 — ShareX 와 같은 기준 max(50, w/20), 최대 w/3.
 * 오버레이 스크롤바 thumb 가 프레임마다 위치를 바꿔 비교를 흐리는 것을 막는다.
 */
function sideMargin(width: number): number {
  return Math.min(Math.max(50, Math.floor(width / 20)), Math.floor(width / 3));
}

export function computeRowInfo(frame: Frame): RowInfo {
  const { width, height, buf } = frame;
  if (buf.length !== width * height * CHANNELS) {
    throw new Error(`스티칭: bitmap 크기 불일치 (${buf.length} != ${width * height * CHANNELS})`);
  }
  // 좁은 프레임(가운데 띠 등) 은 좌우 제외를 하지 않는다 — 제외 후 폭이 칸 수보다 작으면
  // 다음 행·버퍼 밖을 읽게 된다(bug-hunter 지적).
  const margin = sideMargin(width);
  const narrow = width - margin * 2 < BINS;
  const x0 = narrow ? 0 : margin;
  const span = narrow ? width : width - margin * 2;
  const fine = new Uint8Array(height * BINS);
  const coarse = new Uint8Array(height * COARSE_BINS);
  const detailed = new Uint8Array(height);
  const sums = new Uint32Array(BINS);
  const counts = new Uint32Array(BINS);
  for (let y = 0; y < height; y++) {
    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < span; i++) {
      const p = (y * width + x0 + i) * CHANNELS;
      const k = Math.floor((i * BINS) / span);
      sums[k] += (buf[p] + 2 * buf[p + 1] + buf[p + 2]) >> 2;
      counts[k]++;
    }
    detailed[y] = fillRow({ fine, coarse }, y, { sums, counts }) >= DETAIL_MIN ? 1 : 0;
  }
  return { width, height, fine, coarse, detailed };
}

/** 한 행의 칸 평균을 채우고 이웃 칸 차이 합(내용 정도) 을 돌려준다. */
function fillRow(
  out: { fine: Uint8Array; coarse: Uint8Array },
  y: number,
  acc: { sums: Uint32Array; counts: Uint32Array },
): number {
  const { fine, coarse } = out;
  let detail = 0;
  for (let k = 0; k < BINS; k++) {
    const v = acc.counts[k] === 0 ? 0 : Math.round(acc.sums[k] / acc.counts[k]);
    fine[y * BINS + k] = v;
    if (k > 0) detail += Math.abs(v - fine[y * BINS + k - 1]);
  }
  for (let c = 0; c < COARSE_BINS; c++) {
    let s = 0;
    for (let j = 0; j < FINE_PER_COARSE; j++) s += fine[y * BINS + c * FINE_PER_COARSE + j];
    coarse[y * COARSE_BINS + c] = Math.round(s / FINE_PER_COARSE);
  }
  return detail;
}

/** A 의 ya 행과 B 의 yb 행의 평균 칸 차이(정밀). */
export function rowCost(a: RowInfo, b: RowInfo, rows: { ya: number; yb: number }): number {
  const ia = rows.ya * BINS;
  const ib = rows.yb * BINS;
  let s = 0;
  for (let k = 0; k < BINS; k++) {
    s += Math.min(BIN_DIFF_CAP, Math.abs(a.fine[ia + k] - b.fine[ib + k]));
  }
  return s / BINS;
}

/** 거친 칸 평균 차이 — 후보 이동량을 싸게 고를 때. */
export function coarseRowCost(a: RowInfo, b: RowInfo, rows: { ya: number; yb: number }): number {
  const ia = rows.ya * COARSE_BINS;
  const ib = rows.yb * COARSE_BINS;
  let s = 0;
  for (let k = 0; k < COARSE_BINS; k++) {
    s += Math.min(BIN_DIFF_CAP, Math.abs(a.coarse[ia + k] - b.coarse[ib + k]));
  }
  return s / COARSE_BINS;
}
