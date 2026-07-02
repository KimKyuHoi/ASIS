import { nativeImage } from 'electron';

/**
 * 스크롤 캡처 스티칭 — 세로로 겹치는 프레임들을 한 장의 긴 이미지로 이어붙인다.
 *
 * macOS 는 스크롤 캡처를 네이티브로 지원하지 않는다(screencapture 옵션 없음).
 * 그래서 사용자가 스크롤하는 동안 같은 영역을 주기적으로 캡처한 뒤,
 * 인접 프레임 사이의 *세로 겹침(overlap)* 을 픽셀 비교로 찾아 합성한다.
 * sharp/opencv 없이 nativeImage 의 raw bitmap 만으로 순수 처리한다.
 *
 * 알고리즘 (실측으로 검증한 접근 — 리포트의 "실측 결과" 참고)
 *   - 각 프레임을 nativeImage 로 디코드 → toBitmap() 으로 raw 픽셀(4채널/px) 획득.
 *   - "shift" = 이전 프레임 A 에서 다음 프레임 B 의 0행이 정렬되는 y offset.
 *     겹침 행 수 = A.height - shift. shift 가 작을수록 겹침이 크다(= 작은 스크롤).
 *   - 후보 shift 마다 겹침 밴드의 행별 평균 절대차(SAD) 를 구해 최소를 찾는다.
 *   - 고정 헤더/푸터(sticky) 는 매 프레임 같은 위치라 가짜 겹침을 만든다 —
 *     ignoreTop/ignoreBottom 으로 상/하단 영역을 비교에서 제외해 무력화한다.
 *   - 신뢰도: "최소 SAD"의 절대값이 아니라 *최소의 뾰족함(ratio)* 으로 판정한다.
 *     실측상 노이즈가 낀 진짜 겹침의 SAD 가 우연 매칭의 SAD 보다 클 수 있어,
 *     절대 SAD threshold 는 신뢰할 수 없다. 뚜렷한 최소(ratio ≫ 1) 만 채택한다.
 *
 * 룰
 *   - imperative-style.md — 픽셀 루프/버퍼 조작은 모듈 함수 명령형 OK.
 *   - null-safety.md — 빈 이미지·폭 불일치·프레임 0개는 명시 throw.
 *   - react-compiler.md — main process 코드라 memo 무관.
 */

/** 한 프레임의 디코드된 raw 픽셀. buf.length === width * height * channels. */
export type Frame = {
  width: number;
  height: number;
  /** raw bitmap. 채널 순서(BGRA/RGBA)는 read/write 가 대칭이라 무관 — 그대로 복사. */
  buf: Buffer;
};

/** px 당 바이트 수. nativeImage.toBitmap() 은 4채널(RGBA/BGRA) 고정. */
const CHANNELS = 4;

export type StitchOptions = {
  /**
   * 상단에서 비교 제외할 픽셀 높이 — 고정 헤더(sticky top nav) 배제.
   * 기본 0. 헤더가 있으면 그 높이보다 약간 크게 잡는다.
   */
  ignoreTop?: number;
  /**
   * 하단에서 비교 제외할 픽셀 높이 — 고정 푸터/스크롤바 배제. 기본 0.
   */
  ignoreBottom?: number;
  /**
   * 겹침 검출에 쓸 밴드 높이(행). 클수록 정확·느림. 기본 200.
   * 실제로는 사용 가능한 겹침 크기로 클램프된다.
   */
  band?: number;
  /** 가로 픽셀 샘플링 간격 — 클수록 빠름·덜 정확. 기본 6. */
  xStep?: number;
  /** 세로 행 샘플링 간격 — 클수록 빠름·덜 정확. 기본 2. */
  yStep?: number;
  /**
   * 채택 최소 신뢰도(ratio = 두 번째로 좋은 distinct 후보 SAD / 최적 SAD).
   * ratio 가 이보다 낮으면 "뚜렷한 겹침 없음"으로 보고 겹침 제거 없이 butt-join.
   * 기본 1.8 — 실측상 진짜 큰 겹침은 ratio ≫ 2, 겹침 없음은 ~1.
   */
  minRatio?: number;
};

const DEFAULTS = {
  ignoreTop: 0,
  ignoreBottom: 0,
  band: 200,
  xStep: 6,
  yStep: 2,
  minRatio: 1.8,
} as const;

/** 파일 경로에서 Frame 디코드. 빈 이미지면 throw. */
export function loadFrame(path: string): Frame {
  const img = nativeImage.createFromPath(path);
  if (img.isEmpty()) {
    throw new Error(`스티칭: 이미지를 읽지 못함 (빈 이미지): ${path}`);
  }
  const { width, height } = img.getSize();
  const buf = img.toBitmap();
  // toBitmap() 은 width*height*4 를 보장한다(실측 확인). 어긋나면 디코드 이상.
  if (buf.length !== width * height * CHANNELS) {
    throw new Error(
      `스티칭: bitmap 크기 불일치 (${buf.length} != ${width * height * CHANNELS})`,
    );
  }
  return { width, height, buf };
}

/** 한 행의 평균 절대차(SAD). alpha 채널은 무시, RGB 3채널만 비교. */
function rowSad(
  a: Frame,
  b: Frame,
  rowA: number,
  rowB: number,
  xStep: number,
): number {
  const w = Math.min(a.width, b.width);
  let sum = 0;
  let count = 0;
  const baseA = rowA * a.width * CHANNELS;
  const baseB = rowB * b.width * CHANNELS;
  for (let x = 0; x < w; x += xStep) {
    const ia = baseA + x * CHANNELS;
    const ib = baseB + x * CHANNELS;
    sum += Math.abs(a.buf[ia] - b.buf[ib]);
    sum += Math.abs(a.buf[ia + 1] - b.buf[ib + 1]);
    sum += Math.abs(a.buf[ia + 2] - b.buf[ib + 2]);
    count += 3;
  }
  return count === 0 ? Number.POSITIVE_INFINITY : sum / count;
}

export type OverlapResult = {
  /** A 에서 B 의 0행이 정렬되는 y offset. 겹침 행 수 = A.height - shift. */
  shift: number;
  /** 최적 shift 의 평균 SAD (낮을수록 잘 맞음). */
  sad: number;
  /** 최소의 뾰족함 (두 번째 distinct 후보 / 최적). 높을수록 확실한 겹침. */
  ratio: number;
  /** ratio 가 minRatio 이상이라 겹침 제거를 신뢰할 수 있는지. */
  confident: boolean;
};

/**
 * A 의 하단과 B 의 상단이 겹친다고 보고 최적 정렬 shift 를 찾는다.
 *
 * shift 범위는 [minShift, A.height - band] — 즉 *겹침이 최소 band 행 이상* 이어야
 * 채택한다. 실측상 이 제약이 우연 매칭을 크게 줄여 신뢰도를 높인다(작은 스크롤 가정).
 */
export function findOverlap(a: Frame, b: Frame, opts: StitchOptions = {}): OverlapResult {
  const ignoreTop = opts.ignoreTop ?? DEFAULTS.ignoreTop;
  const ignoreBottom = opts.ignoreBottom ?? DEFAULTS.ignoreBottom;
  const xStep = opts.xStep ?? DEFAULTS.xStep;
  const yStep = opts.yStep ?? DEFAULTS.yStep;
  const minRatio = opts.minRatio ?? DEFAULTS.minRatio;

  // 밴드는 헤더/푸터를 제외한 실제 비교 가능 높이로 제한.
  const usableB = b.height - ignoreTop - ignoreBottom;
  const band = Math.max(1, Math.min(opts.band ?? DEFAULTS.band, usableB));

  // 겹침이 최소 band 이상이 되도록 shift 상한을 둔다. 하한은 헤더 자기매칭 방지로 1.
  const minShift = Math.max(1, ignoreTop);
  const maxShift = a.height - band;
  if (maxShift < minShift) {
    // A 가 너무 작아 band 만큼 겹칠 수 없음 — 겹침 검출 불가, butt-join 신호.
    return { shift: a.height, sad: Number.POSITIVE_INFINITY, ratio: 0, confident: false };
  }

  const scores: Array<{ shift: number; sad: number }> = [];
  let best = { shift: a.height, sad: Number.POSITIVE_INFINITY };

  for (let shift = minShift; shift <= maxShift; shift++) {
    let sum = 0;
    let n = 0;
    // B 의 [ignoreTop .. ignoreTop+band) 행을 A 의 대응 행과 비교.
    for (let r = ignoreTop; r < ignoreTop + band; r += yStep) {
      const rowA = shift + r;
      // A 쪽에서도 헤더 영역(< ignoreTop) 자기매칭은 배제.
      if (rowA < ignoreTop || rowA >= a.height) continue;
      sum += rowSad(a, b, rowA, r, xStep);
      n++;
    }
    if (n < 8) continue;
    const sad = sum / n;
    scores.push({ shift, sad });
    if (sad < best.sad) best = { shift, sad };
  }

  if (scores.length === 0) {
    return { shift: a.height, sad: Number.POSITIVE_INFINITY, ratio: 0, confident: false };
  }

  // 최소의 뾰족함 — 최적에서 15px 이상 떨어진 가장 좋은 후보와의 비.
  let secondBest = Number.POSITIVE_INFINITY;
  for (const s of scores) {
    if (Math.abs(s.shift - best.shift) > 15 && s.sad < secondBest) {
      secondBest = s.sad;
    }
  }
  const ratio =
    secondBest === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : secondBest / (best.sad + 0.001);

  return {
    shift: best.shift,
    sad: best.sad,
    ratio,
    confident: ratio >= minRatio,
  };
}

/**
 * A 아래에 B 를 이어붙인 새 Frame 을 만든다.
 *
 * confident 하면 검출된 shift 로 겹침을 제거하고 붙인다:
 *   overlap = A.height - shift, 결과 높이 = A.height + (B.height - overlap).
 * 신뢰 불가면 겹침 제거 없이 B 전체를 그대로 이어붙인다(butt-join).
 *
 * 폭이 다르면 좁은 쪽으로 클립한다(Retina 프레임 폭 흔들림 방어).
 */
export function appendFrame(a: Frame, b: Frame, overlap: OverlapResult): Frame {
  const w = Math.min(a.width, b.width);
  // 신뢰 가능한 겹침만 제거. 아니면 겹침 0(butt-join).
  const removed = overlap.confident ? Math.max(0, a.height - overlap.shift) : 0;
  const firstNewRowInB = Math.min(removed, b.height);
  const newRowsFromB = b.height - firstNewRowInB;
  const outH = a.height + newRowsFromB;
  const out = Buffer.alloc(w * outH * CHANNELS);

  // A 전체를 폭 w 로 클립해 복사.
  for (let y = 0; y < a.height; y++) {
    const srcStart = y * a.width * CHANNELS;
    a.buf.copy(out, y * w * CHANNELS, srcStart, srcStart + w * CHANNELS);
  }
  // B 의 새 콘텐츠 행을 A 아래에 이어붙임.
  for (let r = 0; r < newRowsFromB; r++) {
    const srcRow = firstNewRowInB + r;
    const dstY = a.height + r;
    const srcStart = srcRow * b.width * CHANNELS;
    b.buf.copy(out, dstY * w * CHANNELS, srcStart, srcStart + w * CHANNELS);
  }
  return { width: w, height: outH, buf: out };
}

export type StitchReport = {
  /** 최종 이미지 PNG 바이트. */
  png: Buffer;
  width: number;
  height: number;
  /** 입력 프레임 수. */
  frameCount: number;
  /** 겹침을 신뢰해 제거한 프레임 이음새 수. */
  confidentJoins: number;
  /** 신뢰 불가로 butt-join 한 이음새 수(중복 콘텐츠가 남을 수 있는 지점). */
  fallbackJoins: number;
};

/**
 * 프레임 파일 경로 배열 → 하나의 긴 PNG.
 *
 * @param paths 시간순 프레임 PNG 경로. 최소 1개.
 * @returns 합성 PNG 바이트 + 진단 리포트.
 */
export function stitchFrames(paths: string[], opts: StitchOptions = {}): StitchReport {
  if (paths.length === 0) {
    throw new Error('스티칭: 프레임 0개 — 최소 1개 필요');
  }

  let acc = loadFrame(paths[0]);
  let confidentJoins = 0;
  let fallbackJoins = 0;

  for (let i = 1; i < paths.length; i++) {
    const next = loadFrame(paths[i]);
    // 폭이 완전히 다르면(리사이즈 등) 겹침 비교가 무의미 — butt-join 으로 강등.
    const overlap =
      next.width === acc.width
        ? findOverlap(acc, next, opts)
        : { shift: acc.height, sad: Number.POSITIVE_INFINITY, ratio: 0, confident: false };
    if (overlap.confident) confidentJoins++;
    else fallbackJoins++;
    acc = appendFrame(acc, next, overlap);
  }

  const img = nativeImage.createFromBitmap(acc.buf, {
    width: acc.width,
    height: acc.height,
  });
  const png = img.toPNG();
  if (png.length === 0) {
    throw new Error('스티칭: PNG 인코딩 결과가 비어 있음');
  }

  return {
    png,
    width: acc.width,
    height: acc.height,
    frameCount: paths.length,
    confidentJoins,
    fallbackJoins,
  };
}
