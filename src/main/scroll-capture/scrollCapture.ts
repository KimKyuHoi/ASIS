import log from 'electron-log/main';
import { rmSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from './frameIo';
import { FrameSource, type Rect } from './frameSource';
import { AutoDriver, type ScrollDirection } from './autoDriver';
import { ManualRun, type ManualProgress } from './manualRun';
import { ScrollStitcher } from './scrollStitcher';
import { UserFacingError } from '../userFacingError';
import { tScroll } from './strings';

/**
 * 스크롤 캡처 매니저 — 같은 영역을 계속 찍어, 정지 시 한 장의 긴 PNG 로 잇는다.
 * 캡처·이음 규칙은 manualRun.ts, 매칭은 scrollStitch.ts, 캡처는 regionCapture.ts.
 *
 * 모드 (Shottr·Snagit·CleanShot·ShareX 관례 — 자동이 기본, 수동은 보조)
 *   - auto: 시작하면 캡처는 바로 돌고, 사용자가 알약의 화살표로 방향(↑/↓) 을 고르면
 *     startAuto() 로 autoDriver.ts 가 그 방향으로 스크롤한다. 끝에 닿으면 onEnd. 사용자가 손대면
 *     자동만 멈추고 수동으로 계속 찍는다. 손쉬운 사용 권한이 필요하다(호출측이 확인).
 *   - manual: 사용자가 스크롤하는 만큼만.
 *
 * 룰
 *   - side-effects.md — 파일시스템 + child process lifecycle 은 Class.
 *   - null-safety.md — 중복 start·프레임 0개를 명시 throw.
 */

export type ScrollCaptureMode = 'auto' | 'manual';

export type ScrollCaptureOptions = {
  /** 캡처 영역(전역 논리 좌표, screencapture -R 단위). */
  rect: Rect;
  mode: ScrollCaptureMode;
  /**
   * 캡처가 스스로 끝났을 때 — 자동 스크롤의 끝 감지, 최대 높이 도달, 캡처 루프 실패.
   * 호출측은 정지 버튼과 같은 합성·저장 흐름으로 넘어간다(실패여도 모은 프레임은 살린다).
   */
  onEnd: () => void;
};

export type StitchReport = {
  png: Buffer;
  width: number;
  height: number;
  frameCount: number;
  confidentJoins: number;
  /** 겹침을 못 찾아 그대로 이어붙인 구간 수(빈틈·중복 가능). */
  fallbackJoins: number;
};

type Session = {
  dir: string;
  options: ScrollCaptureOptions;
  /** 자동 스크롤을 이미 시작했는지 — 화살표를 여러 번 눌러도 한 번만. */
  autoStarted: boolean;
  /** 자동 스크롤 promise — 정지·취소가 남은 휠 주입이 끝나길 기다린다. */
  auto: Promise<void>;
  source: FrameSource;
  stitcher: ScrollStitcher;
  run: ManualRun;
  /** 캡처 루프 promise — stop/cancel 이 마지막 반복이 끝나길 기다린다. */
  loop: Promise<void>;
};

const EMPTY_PROGRESS: ManualProgress = { frames: 0, height: 0, gaps: 0 };

export class ScrollCaptureManager {
  private session: Session | null = null;
  private active = false;
  /** stop/cancel 때마다 증가 — start 의 await 사이에 취소됐는지 판정. */
  private generation = 0;

  async start(options: ScrollCaptureOptions): Promise<void> {
    if (this.session || this.active) {
      throw new Error('ScrollCapture.start() — 이미 캡처 중. stop()/cancel() 먼저.');
    }
    // await 전에 켜고 세대를 기록한다 — mkdir 도중 cancel() 이 오면 세대가 바뀐 것을 보고 멈춘다.
    this.active = true;
    const generation = this.generation;
    const dir = join(tmpdir(), `asis-scroll-${String(Date.now())}-${String(process.pid)}`);
    try {
      await mkdir(dir, { recursive: true });
    } catch (err) {
      // 이후 start 가 전부 "이미 캡처 중" 으로 막히지 않게 되돌린다.
      if (generation === this.generation) this.active = false;
      throw err;
    }
    if (generation !== this.generation) {
      await cleanupDir(dir);
      return;
    }
    const source = new FrameSource(dir, options.rect);
    const stitcher = new ScrollStitcher();
    const run = new ManualRun(source, stitcher, {
      isActive: () => this.active,
      onEnd: options.onEnd,
    });
    const loop = run.run().catch((err: unknown) => {
      // 루프가 죽으면(연속 캡처 실패·프레임 크기 변경 등) 알약이 "캡처 중" 으로 멈춰 있지
      // 않도록 종료 흐름으로 넘긴다 — 지금까지 모은 프레임으로 합성한다.
      log.error('[scroll] capture loop failed', err);
      if (this.active) options.onEnd();
    });
    log.info(`[scroll] start mode=${options.mode} rect=${JSON.stringify(options.rect)}`);
    this.session = {
      dir,
      options,
      autoStarted: false,
      auto: Promise.resolve(),
      source,
      stitcher,
      run,
      loop,
    };
  }

  /**
   * 정지 + 합성. 지금까지 채택된 프레임을 한 장으로 이어 outputPath 에 쓴다.
   * 세션이 없으면(start 의 준비 중 정지 — 그 start 는 세대 토큰을 보고 스스로 멈춘다) null.
   */
  async stop(outputPath: string): Promise<StitchReport | null> {
    const session = await this.endSession();
    if (!session) return null;
    try {
      // 들고 있던 후보·보류 프레임(사용자가 마지막에 내린 부분) 까지 확정한다.
      await session.run.flush();
      if (session.stitcher.count() === 0) {
        throw new UserFacingError(tScroll().noFrames, 'ScrollCapture.stop() — 캡처된 프레임이 0개');
      }
      const sum = session.stitcher.finalize((key) => session.source.load(key));
      const png = encodePng(sum.frame);
      await writeFile(outputPath, png);
      return {
        png,
        width: sum.frame.width,
        height: sum.frame.height,
        frameCount: sum.frameCount,
        confidentJoins: sum.confidentJoins,
        fallbackJoins: sum.fallbackJoins,
      };
    } finally {
      await cleanupDir(session.dir);
    }
  }

  /** 취소 — 프레임 폐기, 합성 안 함. start 전이면 아무것도 안 한다. */
  async cancel(): Promise<void> {
    const session = await this.endSession();
    if (session) await cleanupDir(session.dir);
  }

  /**
   * 앱 종료용 즉시 중단 — 루프를 기다리지 않고 임시 폴더를 동기로 지운다. 비동기 cancel 은
   * 프로세스가 먼저 끝나면 asis-scroll-* 폴더가 남는다. 남은 루프의 쓰기는 실패로 기록만 된다.
   */
  abortSync(): void {
    this.active = false;
    this.generation += 1;
    const session = this.session;
    this.session = null;
    if (!session) return;
    try {
      rmSync(session.dir, { recursive: true, force: true });
    } catch (err) {
      log.error('[scroll] tmp cleanup (sync) failed', err);
    }
  }

  /** 진행 상황(채택 장수·결과 높이 px·끊긴 구간) — renderer polling 용. */
  progress(): ManualProgress {
    return this.session ? this.session.run.progress() : EMPTY_PROGRESS;
  }

  /**
   * 사용자가 고른 방향으로 자동 스크롤을 시작한다(auto 모드에서 한 번만). 캡처 루프와 따로
   * 돌며, stop/cancel 은 active 가 꺼지는 것으로 멈춘다.
   */
  startAuto(direction: ScrollDirection): void {
    const session = this.session;
    if (session === null) return;
    if (session.options.mode !== 'auto' || session.autoStarted) return;
    session.autoStarted = true;
    log.info(`[scroll] auto start: ${direction}`);
    session.auto = this.driveAuto(session, direction).catch((err: unknown) => {
      log.error('[scroll] auto scroll crashed', err);
    });
  }

  /** 자동 스크롤 — 끝에 닿으면 정지 버튼과 같은 흐름(onEnd). 사용자가 손대면 수동으로 계속. */
  private async driveAuto(session: Session, direction: ScrollDirection): Promise<void> {
    const { options, run } = session;
    const driver = new AutoDriver(options.rect, run, { direction, isActive: () => this.active });
    try {
      const end = await driver.drive();
      if (end === 'ended' && this.active) options.onEnd();
    } catch (err) {
      // 휠 주입이 실패해도 캡처는 수동으로 계속된다 — 자동만 포기한다.
      log.error('[scroll] auto scroll failed — 수동으로 계속', err);
    }
  }

  /** 루프를 멈추고 마지막 반복이 끝나길 기다린 뒤 세션을 떼어 돌려준다. */
  private async endSession(): Promise<Session | null> {
    this.active = false;
    this.generation += 1;
    const session = this.session;
    if (!session) return null;
    // 자동 스크롤도 끝나길 기다린다 — 정지 뒤 남은 휠 이벤트·커서 복원이 합성과 겹치지 않게.
    await Promise.all([session.loop, session.auto]);
    // 기다리는 사이 다른 호출(stop↔cancel 경합) 이 먼저 떼어 갔으면 그쪽이 소유한다.
    if (this.session !== session) return null;
    this.session = null;
    return session;
  }
}

async function cleanupDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
    log.error('[scroll] tmp cleanup failed', err);
  });
}
