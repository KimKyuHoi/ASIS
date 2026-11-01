import log from 'electron-log/main';
import { delay, type FrameSource, type Shot } from './frameSource';
import { sameRowRatio, SAME_FRAME_RATIO } from './scrollStitch';
import {
  matchFrames,
  maxResultHeight,
  type ScrollStitcher,
} from './scrollStitcher';

/**
 * 스크롤 캡처 엔진 한 회 — 화면이 위·아래로 스크롤되는 동안 계속 찍어, 지나간 범위를 전부
 * 문서 좌표 위에 모은다. 아래로 가면 결과 아래쪽, 위로 가면 결과 위쪽으로 넓어진다.
 * 누가 스크롤하든(사용자 손 / autoDriver.ts 의 휠 주입) 똑같이 동작한다.
 *
 *   - 캡처는 in-process(~17ms) 라 초당 15~20장. 프레임 사이 이동이 작아 빠른 스크롤·관성에도
 *     연속 프레임끼리는 겹친다.
 *   - 연속 프레임끼리의 이동량(matchFrames) 을 누적해 지금 화면의 문서 좌표 y 를 안다.
 *   - 이미 덮은 범위 안이면 아무것도 하지 않는다. 범위 밖으로 나가면 그쪽(위/아래) 후보로 들고
 *     있다가, 화면 절반 이상 넓혔거나 가장자리 프레임과 겹침이 얇아지기 직전에 확정(PNG 저장)
 *     한다 — 저장 프레임 수가 덮은 높이에 비례해 적게 유지된다.
 *   - 확정할 때는 누적값 대신 가장자리 프레임과 직접 다시 맞춰 y 를 정한다(누적 오차 제거).
 *   - 연속 프레임도 안 맞으면(너무 빠름·가림) GAP_CONFIRM_FRAMES 장 보류 후, 마지막 이동 방향의
 *     가장자리 바로 바깥에 추정 위치로 붙인다(끊긴 구간 1개).
 *   - 처음 화면이 움직일 때 한 번, 스크롤되는 열만 남긴다(고정 사이드바 배제 — scrollColumns.ts).
 *
 * 룰: side-effects.md — 캡처 루프 lifecycle 을 가진 객체라 Class. 반복은 재귀로 이어
 * no-await-in-loop 를 지킨다.
 */

/** 연속 프레임 추적을 이만큼 연달아 놓친 뒤에야 끊긴 구간으로 확정한다. */
const GAP_CONFIRM_FRAMES = 3;
/** 가장자리에서 본문 높이의 이 비율 이상 넓히면 바로 확정한다. */
const COMMIT_ADVANCE_RATIO = 0.5;
/** 가장자리와의 거리가 본문 높이의 이 비율을 넘으려 하면 들고 있던 후보부터 확정한다. */
const SAFE_REACH_RATIO = 0.85;
/** 캡처 사이 최소 간격(ms) — main 스레드를 독점하지 않게(~25장/초 상한). */
const MIN_INTERVAL_MS = 40;

export type ManualProgress = { frames: number; height: number; gaps: number };

type Side = 'top' | 'bottom';
type Tracked = { shot: Shot; y: number };

export class ManualRun {
  /** 직전에 찍은 프레임과 그 문서 좌표. null = 아직 첫 프레임 전. */
  private recent: Tracked | null = null;
  private readonly candidate: Record<Side, Tracked | null> = { top: null, bottom: null };
  private pending: Shot[] = [];
  /** 첫 프레임(y = 0) — 스크롤 열 범위가 정해지면 이 프레임을 잘라 다시 시작한다. */
  private first: Shot | null = null;
  /** 마지막으로 움직인 방향(+1 아래, -1 위) — 끊긴 구간을 어느 쪽에 붙일지. */
  private direction = 1;
  /** 마지막으로 화면이 움직인 시각(ms) — 자동 스크롤의 정착 판정에 쓴다. */
  private movedAt = Date.now();
  /**
   * true = 추적을 놓쳐도 끊긴 구간으로 붙이지 않고 기다린다. 자동 스크롤 중에는 속도를 ASIS 가
   * 정하므로 겹침이 사라졌다면 다른 창이 영역을 덮은 것이다(실측: 그 화면이 끊김으로 붙었다).
   */
  private holdGaps = false;

  constructor(
    private readonly source: FrameSource,
    private readonly stitcher: ScrollStitcher,
    private readonly hooks: { isActive: () => boolean; onEnd: () => void },
  ) {}

  progress(): ManualProgress {
    let height = this.stitcher.coveredHeight();
    if (this.stitcher.count() > 0) {
      const top = this.candidate.top;
      const bottom = this.candidate.bottom;
      if (top) height += this.stitcher.edge('top').y - top.y;
      if (bottom) height += bottom.y - this.stitcher.edge('bottom').y;
    }
    return { frames: this.stitcher.count(), height, gaps: this.stitcher.gapCount() };
  }

  /** 자동 스크롤 중 끊김 보류 켜기/끄기(autoDriver.ts). */
  setHoldGaps(hold: boolean): void {
    this.holdGaps = hold;
  }

  /** 지금 화면의 문서 좌표 y 와 마지막으로 움직인 시각. 첫 프레임 전이면 null. */
  position(): { y: number; movedAt: number } | null {
    return this.recent ? { y: this.recent.y, movedAt: this.movedAt } : null;
  }

  async run(): Promise<void> {
    if (!this.hooks.isActive()) return;
    const width = this.recent ? this.recent.shot.info.width : 0;
    if (this.progress().height >= maxResultHeight(width)) {
      log.info('[scroll] max height reached');
      this.hooks.onEnd();
      return;
    }
    const startedAt = Date.now();
    await this.accept(await this.source.shot());
    await delay(Math.max(0, MIN_INTERVAL_MS - (Date.now() - startedAt)));
    await this.run();
  }

  /** 정지 시 — 들고 있던 후보까지 결과에 넣는다(사용자가 마지막에 지나간 부분). */
  async flush(): Promise<void> {
    // 보류 프레임은 붙이지 않는다 — 끊김은 캡처 도중 GAP_CONFIRM_FRAMES 장 확인으로만 확정한다.
    // 정지 직전의 보류는 대개 멈춘 화면 속 애니메이션이나 가림이라, 붙이면 엉뚱한 화면이 끊긴
    // 구간으로 더해졌다(실측: 자동 ↑ 가 맨 위에서 끝난 뒤 +1078px).
    this.pending = [];
    await this.commitCandidate('top');
    await this.commitCandidate('bottom');
  }

  private async accept(shot: Shot): Promise<void> {
    const recent = this.recent;
    if (!recent) {
      await this.placeFirst(shot);
      return;
    }
    const cur = this.lockColumnsOnFirstMove(recent, shot);
    const m = matchFrames(this.recentInfo(), cur.info);
    if (!m) {
      if (this.holdGaps) {
        // 가림이 걷히면 recent 와 다시 맞는다 — 최신 한 장만 들고 기다린다.
        this.pending = [cur];
        return;
      }
      this.pending.push(cur);
      if (this.pending.length >= GAP_CONFIRM_FRAMES) await this.commitGap();
      return;
    }
    this.pending = [];
    if (m.shift !== 0) {
      this.direction = Math.sign(m.shift);
      this.movedAt = Date.now();
    }
    const tracked = { shot: cur, y: this.requireRecent().y + m.shift };
    this.recent = tracked;
    await this.extend(tracked);
  }

  /** 덮은 범위 밖이면 그쪽 후보로 들거나 확정한다. */
  private async extend(t: Tracked): Promise<void> {
    const top = this.stitcher.edge('top');
    const bottom = this.stitcher.edge('bottom');
    if (t.y > bottom.y) await this.extendSide('bottom', t, t.y - bottom.y);
    else if (t.y < top.y) await this.extendSide('top', t, top.y - t.y);
  }

  private async extendSide(side: Side, t: Tracked, reach: number): Promise<void> {
    const body = this.bodyHeight(t.shot);
    if (reach > body * SAFE_REACH_RATIO && this.candidate[side]) {
      // 가장자리와 겹침이 얇아지기 전에 후보를 먼저 확정해 가장자리를 당긴다.
      await this.commitCandidate(side);
      await this.extend(t);
      return;
    }
    if (reach >= body * COMMIT_ADVANCE_RATIO) {
      this.candidate[side] = null;
      await this.commit(t, side);
      return;
    }
    const held = this.candidate[side];
    const further = !held || (side === 'bottom' ? t.y > held.y : t.y < held.y);
    if (further) this.candidate[side] = t;
  }

  /** 가장자리 프레임과 직접 다시 맞춰 y 를 정하고 저장한다(누적 오차 제거). */
  private async commit(t: Tracked, side: Side): Promise<void> {
    const edge = this.stitcher.edge(side);
    const m = matchFrames(edge.info, t.shot.info);
    const y = m ? edge.y + m.shift : t.y;
    const key = await this.source.persist(t.shot);
    this.stitcher.place({ key, info: t.shot.info, y, gap: false, st: m ? m.st : null });
    if (this.requireRecent().shot === t.shot) this.recent = { shot: t.shot, y };
  }

  private async commitCandidate(side: Side): Promise<void> {
    const cand = this.candidate[side];
    if (!cand) return;
    this.candidate[side] = null;
    await this.commit(cand, side);
  }

  /** 연속 프레임 추적을 놓쳤다 — 마지막 이동 방향의 가장자리 바로 바깥에 추정 위치로 붙인다. */
  private async commitGap(): Promise<void> {
    const shots = this.pending;
    this.pending = [];
    const side: Side = this.direction > 0 ? 'bottom' : 'top';
    await this.commitCandidate(side);
    const head = shots[shots.length - 1];
    const edge = this.stitcher.edge(side);
    const body = this.bodyHeight(head);
    const y = side === 'bottom' ? edge.y + body : edge.y - body;
    const key = await this.source.persist(head);
    this.stitcher.place({ key, info: head.info, y, gap: true, st: null });
    this.recent = { shot: head, y };
    log.warn(`[scroll] overlap lost — gap at ${side} (gaps ${String(this.stitcher.gapCount())})`);
  }

  private async placeFirst(shot: Shot): Promise<void> {
    const key = await this.source.persist(shot);
    this.stitcher.place({ key, info: shot.info, y: 0, gap: false, st: null });
    this.recent = { shot, y: 0 };
    this.first = shot;
  }

  /** 고정 헤더/푸터를 뺀 본문 높이(px) — 지금까지 잰 여백 기준. */
  private bodyHeight(shot: Shot): number {
    const m = this.stitcher.margins();
    return Math.max(1, shot.info.height - m.top - m.bottom);
  }

  private recentInfo(): Shot['info'] {
    return this.requireRecent().shot.info;
  }

  private requireRecent(): Tracked {
    if (!this.recent) throw new Error('ManualRun — 첫 프레임 전 추적 조회');
    return this.recent;
  }

  /**
   * 처음 화면이 움직였을 때 한 번, 스크롤되는 열만 남긴다. 잘리면 첫 프레임만 있는 상태여야
   * 한다 — 이미 여러 장을 놓았으면 범위를 바꿀 수 없으니 전체 폭으로 확정한다.
   */
  private lockColumnsOnFirstMove(recent: Tracked, cur: Shot): Shot {
    if (this.source.hasLockedColumns()) return cur;
    // 정합 결과(matchFrames) 로 거르지 않는다 — 열을 자르기 전 프레임에는 고정 사이드바가 섞여
    // 움직인 화면도 "제자리 변화(이동 0)" 로 나와, 열 판정이 끝내 시작되지 않았다(실측: 자동 ↑ 가
    // 첫 단계에서 멈춤). 화면이 달라졌으면 시도한다 — 열 판정은 가운데 띠만 봐 사이드바와 무관하다.
    if (sameRowRatio(recent.shot.info, cur.info) >= SAME_FRAME_RATIO) return cur;
    const held = this.candidate.top !== null || this.candidate.bottom !== null;
    const firstShot = this.first;
    if (!firstShot || this.stitcher.count() > 1 || held) {
      // 이미 전체 폭으로 놓거나 후보로 들고 있는 프레임이 있다 — 폭을 바꾸면 서로 비교할 수 없다.
      this.source.lockFullWidth();
      return cur;
    }
    const placedFirst = this.stitcher.edge('top');
    // 아직 첫 프레임만 놓였다 = 그때까지 화면은 y 0 에 머물렀다.
    const locked = this.source.lockColumns(firstShot, cur);
    if (!locked?.cropped) return cur;
    // 보류 프레임은 잘리기 전 폭이라 더는 비교할 수 없다 — 버린다. 잠금 전에는 고정 사이드바 때문에
    // 움직인 프레임이 대개 정합되지 않아 보류되는데, 이것 때문에 잠금을 포기하면 끝내 전체 폭으로
    // 고정되어 자동 스크롤이 첫 단계에서 멈췄다(실측).
    this.pending = [];
    this.stitcher.restart({ ...placedFirst, info: locked.first.info });
    this.first = locked.first;
    this.recent = { shot: locked.first, y: 0 };
    return locked.next;
  }
}
