import { computeRowInfo, findShift, measureStatic, type Frame } from './scrollStitch';

/**
 * 스크롤되는 열(column) 범위 검출 — 영역 안에 고정 사이드바·패널이 있을 때 쓴다.
 *
 * 사용자가 창 전체나 화면 전체를 고르면(실사용 보고: Claude 앱 전체 화면) 가운데 본문만
 * 스크롤되고 좌우 사이드바는 그대로다. 행 단위 비교는 "B 의 y행 == A 의 y+d 행" 을 전체 폭으로
 * 보므로, 고정 사이드바가 섞인 행은 어떤 d 에서도 일치하지 않아 이음이 전부 실패한다
 * (오프라인 재현: 사이드바 레이아웃에서 4이음 전부 fallback).
 *
 * 방법 — 첫 스크롤 전후 두 프레임 A·B 로
 *   1. 가운데 띠만으로 shift d 를 구한다(가운데는 보통 본문 — 휠 이벤트도 그 자리로 보낸다).
 *   2. 열마다 "A 의 y+d 행과 같다(움직임)" vs "A 의 y 행과 같다(고정)" 를 센다. 두 가설이
 *      구분되는 픽셀(A[y] ≠ A[y+d]) 만 센다 — 빈 여백 열은 판정 불가로 남는다.
 *   3. 가운데에서 좌우로 넓히다가 고정 열이 연달아 나오면 멈춘다.
 *
 * 룰: imperative-style.md — 픽셀 루프 명령형. null-safety.md — 판정 불가는 null 로 명시.
 */

export type Columns = { x0: number; x1: number };

/**
 * moving = 내용과 함께 움직임, static = 제자리(사이드바), noise = 둘 다 아님이 많음(내용과 다른
 * 속도로 움직이는 스크롤바 thumb 등), unknown = 근거 부족(빈 여백).
 */
type ColumnKind = 'moving' | 'static' | 'noise' | 'unknown';

/**
 * 가운데 띠 폭(px) 하한과 비율. 10% 였을 때는 본문 글줄이 왼쪽 정렬이라 짧은 줄이 많은 구간에서
 * 띠가 거의 비어 이동량을 못 찾았다(실측: 자동 ↓ 가 중간에서 시작하면 첫 단계에서 멈춤).
 * 고정 사이드바는 양 끝에 있으므로 가운데 40% 는 대개 본문 안이다.
 */
const BAND_MIN_PX = 80;
const BAND_RATIO = 0.4;
/** 열 판정에 필요한 최소 근거 픽셀 수. */
const MIN_EVIDENCE = 4;
/** 고정 열이 이만큼 연달아 나오면 경계로 본다(표 테두리 1px 같은 우연 배제). */
const STATIC_RUN = 3;
/** 이보다 좁은 범위는 신뢰하지 않는다. */
const MIN_SPAN_PX = 100;
/** 범위가 전체 폭의 이 비율 이상이면 자를 필요 없음. */
const FULL_RATIO = 0.95;
/** "어느 쪽과도 안 맞음" 픽셀이 이 이상이면 noise 열. */
const NOISE_MIN = 8;
/**
 * 오른쪽 끝에서 잘라 낼 수 있는 최대 폭 — 스크롤바(약 15pt) 를 넉넉히 덮되, 판정을 잘못해도
 * 본문을 크게 잘라 먹지 않게 상한을 둔다. max(48px, 폭의 3%).
 */
const SCROLLBAR_MAX_RATIO = 0.03;
const SCROLLBAR_MAX_PX = 48;
/** 마지막 본문 열 뒤로 남겨 둘 여유(px). */
const SCROLLBAR_PAD = 2;
const CHANNELS = 4;

export function cropColumns(frame: Frame, cols: Columns): Frame {
  const width = cols.x1 - cols.x0;
  const out = Buffer.alloc(width * frame.height * CHANNELS);
  for (let y = 0; y < frame.height; y++) {
    const src = (y * frame.width + cols.x0) * CHANNELS;
    frame.buf.copy(out, y * width * CHANNELS, src, src + width * CHANNELS);
  }
  return { width, height: frame.height, buf: out };
}

/**
 * 스크롤되는 열 범위.
 * @returns Columns = 이 범위만 쓴다, 'full' = 자를 필요 없음(전체 폭이 움직이거나 범위를
 *   믿기 어려움), null = 아직 판정 불가(가운데 띠에서 이동을 못 찾음 — 다음 프레임에서 재시도).
 *
 * 위로 스크롤한 경우(콘텐츠가 아래로) 는 두 프레임을 바꿔 "아래로 이동" 으로 본다 — 열 분류는
 * 방향과 무관하다. 처음부터 위로 스크롤하면 판정을 못 해 전체 폭으로 고정되던 문제(실측) 대응.
 */
export function detectScrollColumns(a: Frame, b: Frame): Columns | 'full' | null {
  if (a.width !== b.width || a.height !== b.height) return 'full';
  const down = centerShift(a, b);
  const up = down ? null : centerShift(b, a);
  const motion = down ?? up;
  if (!motion) return null;
  const kinds = down ? classifyColumns(a, b, motion) : classifyColumns(b, a, motion);
  const cx = Math.floor(a.width / 2);
  if (kinds[cx] === 'static') return 'full';
  const x0 = expand(kinds, cx, -1) + 1;
  const x1 = trimScrollbar(kinds, { x0, x1: expand(kinds, cx, 1) });
  const span = x1 - x0;
  if (span < MIN_SPAN_PX) return 'full';
  if (span >= a.width * FULL_RATIO && x1 === a.width) return 'full';
  return { x0, x1 };
}

/** 가운데 띠로 구한 shift 와 고정 헤더/푸터. */
function centerShift(a: Frame, b: Frame): { d: number; top: number; bottom: number } | null {
  const bw = Math.min(a.width, Math.max(BAND_MIN_PX, Math.floor(a.width * BAND_RATIO)));
  const band = { x0: Math.floor((a.width - bw) / 2), x1: Math.floor((a.width + bw) / 2) };
  const ia = computeRowInfo(cropColumns(a, band));
  const ib = computeRowInfo(cropColumns(b, band));
  const st = measureStatic(ia, ib);
  const found = findShift(ia, ib, { top: st.top, bottom: st.bottom });
  // 이동량 0(가운데가 안 움직임) 이면 열을 가를 근거가 없다.
  return found && found.shift > 0 ? { d: found.shift, top: st.top, bottom: st.bottom } : null;
}

function classifyColumns(
  a: Frame,
  b: Frame,
  motion: { d: number; top: number; bottom: number },
): ColumnKind[] {
  const { width, height } = a;
  // 새 ArrayBuffer 로 복사 — Buffer 의 byteOffset 이 4 의 배수가 아닐 수 있다.
  const pa = new Uint32Array(new Uint8Array(a.buf).buffer);
  const pb = new Uint32Array(new Uint8Array(b.buf).buffer);
  const kinds: ColumnKind[] = [];
  const yEnd = height - motion.bottom - motion.d;
  for (let x = 0; x < width; x++) {
    let moving = 0;
    let fixed = 0;
    let neither = 0;
    for (let y = motion.top; y < yEnd; y += 2) {
      const same = pa[y * width + x];
      const shifted = pa[(y + motion.d) * width + x];
      if (same === shifted) continue;
      const v = pb[y * width + x];
      if (v === shifted) moving++;
      else if (v === same) fixed++;
      else neither++;
    }
    kinds.push(kindOf({ moving, fixed, neither }));
  }
  return kinds;
}

function kindOf(c: { moving: number; fixed: number; neither: number }): ColumnKind {
  if (c.moving >= MIN_EVIDENCE && c.moving > c.fixed * 2 && c.moving >= c.neither) return 'moving';
  if (c.fixed >= MIN_EVIDENCE && c.fixed > c.moving * 2) return 'static';
  if (c.neither >= NOISE_MIN) return 'noise';
  return 'unknown';
}

/**
 * 범위 오른쪽 끝의 오버레이 스크롤바 자리를 잘라 낸다 — 스크롤하는 동안 나타난 thumb 가 이음마다
 * 다른 위치로 찍혀 결과 오른쪽에 회색 조각으로 남았다(실측). 열 범위를 정하는 첫 움직임에는
 * thumb 가 아직 안 보여 그 자리는 "근거 없음" 으로만 나온다(실측) — 그래서 마지막 moving 열 뒤의
 * 좁은 구간(상한 이내) 을 통째로 자른다. 상한을 넘으면(넓은 빈 여백) 자르지 않는다.
 */
function trimScrollbar(kinds: ColumnKind[], span: Columns): number {
  let lastMoving = span.x1 - 1;
  while (lastMoving > span.x0 && kinds[lastMoving] !== 'moving') lastMoving--;
  const cut = Math.min(span.x1, lastMoving + 1 + SCROLLBAR_PAD);
  const limit = Math.max(SCROLLBAR_MAX_PX, Math.floor(kinds.length * SCROLLBAR_MAX_RATIO));
  return span.x1 - cut > limit ? span.x1 : cut;
}

/** from 에서 step 방향으로 넓혀, 고정 열이 STATIC_RUN 개 연달아 나오기 직전 경계를 돌려준다. */
function expand(kinds: ColumnKind[], from: number, step: 1 | -1): number {
  let run = 0;
  let x = from;
  while (x >= 0 && x < kinds.length) {
    run = kinds[x] === 'static' ? run + 1 : 0;
    if (run >= STATIC_RUN) return x - step * (STATIC_RUN - 1);
    x += step;
  }
  return x;
}
