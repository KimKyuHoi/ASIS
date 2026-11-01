import {
  bodySameRatio,
  findShift,
  isStill,
  measureStatic,
  sameRowRatio,
  SAME_FRAME_RATIO,
  type Frame,
  type RowInfo,
} from './scrollStitch';
import { UserFacingError } from '../userFacingError';
import { tScroll } from './strings';

/**
 * 스크롤 캡처 합성 — 프레임마다 *문서 좌표* y(첫 프레임 상단 = 0, 아래로 +) 를 두고, 전체 범위
 * [minY, maxY + 프레임 높이] 를 한 장으로 칠한다.
 *
 * 이전 구현은 항상 아래쪽에 이어붙였다 — 아래에서 위로 스크롤하면 위쪽 내용이 결과 아래에 붙었다
 * (사용자 보고). 문서 좌표로 두면 위로 가면 위쪽, 아래로 가면 아래쪽으로 넓어지고, 방향을 바꿔
 * 오가도 이미 덮은 범위는 다시 쌓이지 않는다.
 *
 * 룰: imperative-style.md — 픽셀 복사 명령형. null-safety.md — 프레임 0개·크기 불일치 명시 throw.
 */

const CHANNELS = 4;
/**
 * 결과 높이 상한(px). 무한 스크롤 페이지·제자리 변화 누적 방어 + nativeImage 인코딩
 * 메모리(폭 3000px 기준 ~360MB raw) 를 고려한 값.
 */
export const MAX_RESULT_HEIGHT_PX = 30000;
/**
 * 결과 raw bitmap 상한(바이트). 높이만 막으면 넓은 영역(6K 전체 폭 Retina ≈ 6016px) 에서
 * 6016 × 4 × 30000 ≈ 722MB 를 한 번에 할당한다(계산값) — 폭에 따라 높이 상한을 낮춘다.
 */
const MAX_RESULT_BYTES = 360 * 1024 * 1024;

/** 이 폭(px) 의 결과가 가질 수 있는 최대 높이 — 높이 상한과 바이트 상한 중 작은 값. */
export function maxResultHeight(width: number): number {
  const byBytes = Math.floor(MAX_RESULT_BYTES / (Math.max(1, width) * CHANNELS));
  return Math.min(MAX_RESULT_HEIGHT_PX, byBytes);
}
/** 겹침을 못 찾았어도 본문 행이 이 비율 이상 같은 자리에 그대로면 제자리 변화로 본다. */
const IN_PLACE_RATIO = 0.5;

export type Static = { top: number; bottom: number };

/** 두 프레임의 세로 관계. shift 양수 = 아래로 스크롤(콘텐츠가 위로), 음수 = 위로, 0 = 정지. */
export type Match = { shift: number; st: Static };

/**
 * 두 프레임 사이 세로 이동량과 고정 헤더/푸터. 못 찾으면 null(겹침 없음).
 * 아래·위 두 방향을 모두 재 더 잘 맞는 쪽을 고른다 — 비슷한 텍스트 줄끼리 반대 방향으로
 * 가짜 정합되는 것을 막는다(실측: 위로 되돌린 구간이 중복됐다).
 */
export function matchFrames(a: RowInfo, b: RowInfo): Match | null {
  if (a.width !== b.width || a.height !== b.height) {
    throw new UserFacingError(
      tScroll().frameSizeChanged,
      `스티칭: 프레임 크기 변경 (${a.width}x${a.height} → ${b.width}x${b.height})`,
    );
  }
  const none = { top: 0, bottom: 0 };
  if (sameRowRatio(a, b) >= SAME_FRAME_RATIO) return { shift: 0, st: none };
  const st = measureStatic(a, b);
  const opts = { top: st.top, bottom: st.bottom };
  const down = findShift(a, b, opts);
  const up = findShift(b, a, opts);
  if (down && up) {
    return down.cost <= up.cost ? { shift: down.shift, st } : { shift: -up.shift, st };
  }
  if (down) return { shift: down.shift, st };
  if (up) return { shift: -up.shift, st };
  // 같은 자리 비교가 정합 기준 안이거나 본문 대부분이 그대로 = 제자리 변화(애니메이션) — 정지.
  const still = isStill(a, b) || bodySameRatio(a, b, st) >= IN_PLACE_RATIO;
  return still ? { shift: 0, st } : null;
}

export type Placed = {
  /** persist 한 PNG 경로. */
  key: string;
  info: RowInfo;
  /** 문서 좌표(px) — 첫 프레임 상단 = 0. */
  y: number;
  /** 겹침 없이 추정 위치에 붙인 프레임(빈틈·중복 가능). */
  gap: boolean;
  /** 이 프레임을 놓을 때 잰 고정 헤더/푸터(첫 프레임은 null). */
  st: Static | null;
};

export type StitchSummary = {
  frame: Frame;
  frameCount: number;
  confidentJoins: number;
  fallbackJoins: number;
};

export class ScrollStitcher {
  private readonly frames: Placed[] = [];

  place(p: Placed): void {
    this.frames.push(p);
  }

  /** 첫 프레임부터 다시 — 스크롤 열 범위가 정해져 행 요약 폭이 바뀌었을 때. */
  restart(first: Placed): void {
    this.frames.length = 0;
    this.frames.push(first);
  }

  count(): number {
    return this.frames.length;
  }

  gapCount(): number {
    return this.frames.filter((f) => f.gap).length;
  }

  /** 가장 위(top) / 가장 아래(bottom) 에 놓인 프레임. */
  edge(side: 'top' | 'bottom'): Placed {
    if (this.frames.length === 0) throw new Error('스티칭: 프레임 0개에서 edge 조회');
    let pick = this.frames[0];
    for (const f of this.frames) {
      if (side === 'top' ? f.y < pick.y : f.y > pick.y) pick = f;
    }
    return pick;
  }

  /** 지금까지 덮은 문서 높이(px). */
  coveredHeight(): number {
    if (this.frames.length === 0) return 0;
    return this.edge('bottom').y - this.edge('top').y + this.frames[0].info.height;
  }

  /** 합성에 쓸 고정 헤더/푸터 — 잰 값의 최소(우연히 같은 빈 행 배제) + 하단 최소 여백. */
  margins(): Static {
    const h = this.frames.length === 0 ? 0 : this.frames[0].info.height;
    const measured = this.frames.flatMap((f) => (f.st ? [f.st] : []));
    if (measured.length === 0) return { top: 0, bottom: 0 };
    const top = Math.min(...measured.map((s) => s.top));
    const detected = Math.min(...measured.map((s) => s.bottom));
    // ShareX 처럼 하단 최소 여백 max(50px, h/10) — 창의 둥근 모서리·"맨 아래로" 버튼처럼
    // 가장자리에만 걸친 것이 이음마다 반복되지 않고 맨 아래에서 한 번만 나오게.
    const minFooter = Math.min(Math.max(50, Math.floor(h / 10)), Math.floor(h / 3));
    return { top, bottom: Math.max(detected, minFooter) };
  }

  /**
   * 실제 픽셀 합성. 캔버스를 먼저 할당하고 프레임은 하나씩 load → 복사 → 버림.
   *   1) 각 프레임 전체 — 이웃 본문이 못 덮는 빈틈이 생겨도 무언가로 채워진다.
   *   2) 각 프레임 본문(헤더·푸터 제외) — 중간에 반복되는 고정 헤더/푸터를 덮는다.
   *   3) 맨 위 프레임의 헤더, 맨 아래 프레임의 푸터 — 한 번씩만.
   */
  finalize(load: (key: string) => Frame): StitchSummary {
    if (this.frames.length === 0) {
      throw new UserFacingError(tScroll().noFrames, '스티칭: 프레임 0개 — 최소 1개 필요');
    }
    const { width, height: h } = this.frames[0].info;
    const minY = this.edge('top').y;
    const outH = this.coveredHeight();
    const m = this.margins();
    const out = Buffer.alloc(width * CHANNELS * outH);
    const paint = (frame: Frame, rows: { from: number; to: number; at: number }): void => {
      const rowBytes = width * CHANNELS;
      frame.buf.copy(out, rows.at * rowBytes, rows.from * rowBytes, rows.to * rowBytes);
    };
    // 패스마다 다시 읽는다(디코드 ~10ms/장) — 모든 프레임 픽셀을 동시에 들고 있지 않기 위해.
    const read = (f: Placed): Frame => loadChecked(load, f.key, { width, h });
    for (const f of this.frames) paint(read(f), { from: 0, to: h, at: f.y - minY });
    for (const f of this.frames) {
      paint(read(f), { from: m.top, to: h - m.bottom, at: f.y - minY + m.top });
    }
    paint(read(this.edge('top')), { from: 0, to: m.top, at: 0 });
    paint(read(this.edge('bottom')), { from: h - m.bottom, to: h, at: outH - m.bottom });
    return {
      frame: { width, height: outH, buf: out },
      frameCount: this.frames.length,
      confidentJoins: this.frames.filter((f) => f.st && !f.gap).length,
      fallbackJoins: this.gapCount(),
    };
  }
}

function loadChecked(
  load: (key: string) => Frame,
  key: string,
  size: { width: number; h: number },
): Frame {
  const frame = load(key);
  if (frame.width !== size.width || frame.height !== size.h) {
    throw new UserFacingError(tScroll().frameSizeChanged, '스티칭: 합성 중 프레임 크기 불일치');
  }
  return frame;
}
