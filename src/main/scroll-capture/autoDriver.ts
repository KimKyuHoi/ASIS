import log from 'electron-log/main';
import { delay, type Rect } from './frameSource';
import type { ManualRun } from './manualRun';
import { getCursorPosition, postScroll, warpCursor } from './scrollEvents';

/**
 * 자동 스크롤 — 휠 이벤트로 일정량씩 내리고, 화면이 멈추면 다음 단계, 더 안 내려가면 끝.
 *
 * Shottr·Snagit·CleanShot·ShareX 의 관례(자동이 기본, 수동은 보조) 를 따른다. 캡처·이어붙이기는
 * 하지 않는다 — ManualRun 이 계속 찍으며 위치를 추적하고, 여기서는 그 위치(position) 만 보고
 * "멈췄나 / 끝인가 / 사용자가 손댔나" 를 판단한다. 그래서 자동 중에 사용자가 직접 스크롤해도
 * 결과가 끊기지 않는다.
 *
 *   - 끝: 스크롤했는데 화면이 END_STREAK 번 연속 안 움직임(ShareX 의 "직전 두 장 동일") → onEnd.
 *   - 사용자 개입: 커서를 영역 중앙에서 옮기거나 위로 스크롤함 → 자동만 멈추고 수동으로 계속.
 *     정지 버튼을 누르러 마우스를 옮기는 것도 여기에 해당한다.
 *   - 방향: 사용자가 알약의 화살표(↑/↓) 로 고른다. CG 휠 부호는 실측상 음수 = 아래로(합성 이벤트는
 *     자연스러운 스크롤 설정의 영향을 받지 않음 — 실측). 방향을 스스로 뒤집지 않는다 — 첫 프레임의
 *     가짜 정합 하나로 방향을 뒤집어 중간에 멈춘 적이 있다(실측).
 *
 * 룰: side-effects.md — 커서·이벤트 주입 lifecycle 을 가진 객체라 Class. 단계는 재귀로 이어
 * no-await-in-loop 를 지킨다.
 */

/** 시작 전 대기 — 영역 선택 오버레이가 사라지고 첫 프레임이 찍힐 시간. */
const START_DELAY_MS = 400;
/** 한 번에 스크롤할 양 = 영역 높이의 이 비율. 엔진이 초당 15~20장 찍으므로 겹침은 충분하다. */
const STEP_RATIO = 0.7;
/** 이 시간 동안 위치가 안 바뀌면 정착으로 본다(관성·부드러운 스크롤 애니메이션 포함). */
const SETTLE_QUIET_MS = 300;
/** 정착을 기다리는 최대 시간. */
const SETTLE_TIMEOUT_MS = 2500;
/**
 * 이 시간 안에 화면이 한 번도 안 움직이면 "안 움직임" 으로 본다. 실측: 휠 이벤트 후 화면
 * 반영까지 ~330-420ms — 그 전에 정착으로 판정하면 끝으로 오인한다.
 */
const NO_MOVE_TIMEOUT_MS = 1000;
const POLL_MS = 50;
/** 연속 이만큼 안 움직이면 끝. 한 번은 이벤트 지연일 수 있다. */
const END_STREAK = 2;
/** 이 이상 커서가 중앙에서 벗어나면 사용자가 마우스를 잡은 것으로 본다. */
const CURSOR_SLOP_PT = 3;

export type AutoEnd = 'ended' | 'manual' | 'stopped';

/** 사용자가 고른 자동 스크롤 방향. */
export type ScrollDirection = 'up' | 'down';

export class AutoDriver {
  private readonly center: { x: number; y: number };
  private readonly stepPt: number;
  /** CG 휠 부호 — 음수 = 아래로. */
  private readonly wheelSign: number;
  /** 고른 방향으로 갈 때 문서 좌표 y 가 변하는 부호(아래 +1, 위 -1). */
  private readonly expected: number;
  private confirmed = false;
  private stillStreak = 0;
  private warped = false;
  private readonly isActive: () => boolean;

  constructor(
    rect: Rect,
    private readonly run: ManualRun,
    opts: { direction: ScrollDirection; isActive: () => boolean },
  ) {
    this.isActive = opts.isActive;
    this.expected = opts.direction === 'down' ? 1 : -1;
    this.wheelSign = opts.direction === 'down' ? -1 : 1;
    this.center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    this.stepPt = Math.max(40, Math.round(rect.h * STEP_RATIO));
  }

  async drive(): Promise<AutoEnd> {
    const saved = getCursorPosition();
    this.run.setHoldGaps(true);
    await delay(START_DELAY_MS);
    const end = await this.loop().finally(() => {
      // 자동이 끝나면(수동 전환 포함) 끊김은 다시 보통대로 붙인다.
      this.run.setHoldGaps(false);
    });
    // 사용자가 마우스를 잡지 않았다면 커서를 원래 자리로 돌려놓는다.
    if (this.warped && !this.userMovedCursor()) warpCursor(saved);
    log.info(`[scroll] auto: ${end}`);
    return end;
  }

  private async loop(): Promise<AutoEnd> {
    if (!this.isActive()) return 'stopped';
    if (this.userMovedCursor()) return 'manual';
    const before = this.currentY();
    warpCursor(this.center);
    this.warped = true;
    await postScroll(this.center, this.wheelSign * this.stepPt, this.isActive);
    await this.waitSettled();
    if (!this.isActive()) return 'stopped';
    const outcome = this.judge(this.currentY() - before);
    return outcome ?? this.loop();
  }

  /** 한 단계의 이동량으로 다음 행동을 정한다. null = 계속. */
  private judge(movedY: number): AutoEnd | null {
    const moved = movedY * this.expected;
    if (moved > 0) {
      this.confirmed = true;
      this.stillStreak = 0;
      return null;
    }
    // 방향이 확인된 뒤 반대로 움직임 = 사용자가 직접 스크롤했다. 확인 전의 반대 이동은 가짜 정합일
    // 수 있으니 무시하고 다음 단계를 본다.
    if (moved < 0) return this.confirmed ? 'manual' : null;
    this.stillStreak += 1;
    return this.stillStreak >= END_STREAK ? 'ended' : null;
  }

  /** 이번 단계에서 화면이 움직였다가 SETTLE_QUIET_MS 동안 멈출 때까지(또는 끝내 안 움직일 때까지). */
  private async waitSettled(): Promise<void> {
    const startedAt = Date.now();
    await delay(SETTLE_QUIET_MS);
    const poll = async (): Promise<void> => {
      const now = Date.now();
      const pos = this.run.position();
      const movedAt = pos ? pos.movedAt : 0;
      const quiet = movedAt > startedAt
        ? now - movedAt >= SETTLE_QUIET_MS
        : now - startedAt >= NO_MOVE_TIMEOUT_MS;
      if (quiet || !this.isActive() || now - startedAt >= SETTLE_TIMEOUT_MS) return;
      await delay(POLL_MS);
      await poll();
    };
    await poll();
  }

  private currentY(): number {
    const pos = this.run.position();
    return pos ? pos.y : 0;
  }

  private userMovedCursor(): boolean {
    if (!this.warped) return false;
    const now = getCursorPosition();
    const dx = Math.abs(now.x - this.center.x);
    const dy = Math.abs(now.y - this.center.y);
    return dx > CURSOR_SLOP_PT || dy > CURSOR_SLOP_PT;
  }
}
