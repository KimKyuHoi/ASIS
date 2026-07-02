import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../runProcess';
import { stitchFrames, type StitchOptions, type StitchReport } from './scrollStitch';

const SCREENCAPTURE_BIN = '/usr/sbin/screencapture';

/**
 * 스크롤 캡처 매니저 — 사용자가 스크롤하는 동안 같은 영역을 주기적으로
 * `screencapture -R` 로 찍어 PNG 시퀀스를 만들고, 정지 시 세로 스티칭해
 * 한 장의 긴 PNG 를 만든다.
 *
 * macOS 는 스크롤 캡처 네이티브 미지원 → 다중 캡처 + 픽셀 겹침 검출로 구현.
 * 캡처 루프는 SequenceCaptureManager 와 동일하게 *재귀 setTimeout* 을 쓴다:
 * setInterval 은 이전 캡처가 안 끝난 채 겹쳐 실행돼 race 가 난다(sequenceCapture.ts 주석 참고).
 *
 * 룰
 *   - side-effects.md — 파일시스템 + child process lifecycle 은 Class. (GifManager 결.)
 *   - imperative-style.md — spawn/버퍼/루프 명령형 OK.
 *   - null-safety.md — active 중복 start·프레임 0개·screencapture 실패를 명시 throw.
 */

export type ScrollCaptureOptions = {
  /** 캡처 영역(전역 논리 좌표, screencapture -R 단위). */
  rect: { x: number; y: number; w: number; h: number };
  /**
   * 프레임 간 최소 간격(ms). 기본 450.
   * 스크롤 캡처는 인접 프레임이 *크게 겹쳐야* 검출 신뢰도가 높다(실측). 너무 길면
   * 사용자가 빨리 스크롤할 때 겹침이 사라지므로, 사용자에게 "천천히" 안내가 필요.
   */
  intervalMs?: number;
  /** 스티칭 옵션 — 고정 헤더/푸터 ignore 등. */
  stitch?: StitchOptions;
};

/** 기본 프레임 간격 — 실측상 이 간격이면 보통 스크롤 한 번에 큰 겹침이 남는다. */
const DEFAULT_INTERVAL_MS = 450;

export class ScrollCaptureManager {
  private framesDir: string | null = null;
  private frameIndex = 0;
  private rect: ScrollCaptureOptions['rect'] | null = null;
  private intervalMs = DEFAULT_INTERVAL_MS;
  private stitchOpts: StitchOptions = {};
  /** 캡처 루프 active 여부. */
  private active = false;
  private nextTimer: NodeJS.Timeout | null = null;
  /**
   * 진행 중인 프레임 캡처 promise. stop() 이 이걸 await 해서 마지막 프레임의
   * 파일 쓰기가 끝난 뒤 스티칭하도록 보장한다(폴링 대신 직접 대기 — race 없음).
   */
  private inFlight: Promise<void> | null = null;

  /**
   * 캡처 시작 — 임시 폴더 생성 후 첫 프레임 즉시, 이후 재귀 setTimeout 으로 연속.
   */
  async start(options: ScrollCaptureOptions): Promise<void> {
    if (this.active) {
      throw new Error('ScrollCapture.start() — 이미 캡처 중. stop()/cancel() 먼저.');
    }
    const dir = join(tmpdir(), `asis-scroll-${Date.now()}-${process.pid}`);
    await mkdir(dir, { recursive: true });
    this.framesDir = dir;
    this.frameIndex = 0;
    this.rect = options.rect;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.stitchOpts = options.stitch ?? {};
    this.active = true;
    this.scheduleNext(0);
  }

  /**
   * 정지 + 스티칭. 지금까지 캡처한 프레임을 한 장의 긴 PNG 로 합성해 파일로 저장.
   * @param outputPath 최종 PNG 를 쓸 경로.
   * @returns 스티칭 진단 리포트(프레임 수·신뢰/폴백 이음새 수·최종 크기).
   */
  async stop(outputPath: string): Promise<StitchReport> {
    this.active = false;
    this.clearTimer();
    const dir = this.framesDir;
    if (!dir) {
      throw new Error('ScrollCapture.stop() — start() 안 호출됨');
    }
    // 진행 중 캡처가 프레임 파일을 마저 쓰도록 대기(마지막 프레임 유실 방지).
    // active=false 라 이 promise 이후 새 캡처는 스케줄되지 않는다.
    if (this.inFlight) {
      await this.inFlight.catch(() => {
        // 마지막 프레임 캡처 실패는 무시 — 이전 프레임들로 스티칭 진행.
      });
    }
    if (this.frameIndex === 0) {
      // 정리 후 명시 throw — 프레임 0개면 합성할 게 없다.
      await this.cleanupDir(dir);
      this.framesDir = null;
      throw new Error('ScrollCapture.stop() — 캡처된 프레임이 0개');
    }

    const paths: string[] = [];
    for (let i = 0; i < this.frameIndex; i++) {
      paths.push(join(dir, frameName(i)));
    }
    try {
      const report = stitchFrames(paths, this.stitchOpts);
      await writeFile(outputPath, report.png);
      return report;
    } finally {
      this.framesDir = null;
      this.frameIndex = 0;
      await this.cleanupDir(dir);
    }
  }

  /** 취소 — 프레임 폐기, 스티칭 안 함. */
  async cancel(): Promise<void> {
    this.active = false;
    this.clearTimer();
    this.inFlight = null;
    const dir = this.framesDir;
    this.framesDir = null;
    this.frameIndex = 0;
    if (dir) await this.cleanupDir(dir);
  }

  isRecording(): boolean {
    return this.active;
  }

  /** 현재까지 캡처된 프레임 수 — renderer polling 용. */
  count(): number {
    return this.frameIndex;
  }

  private clearTimer(): void {
    if (this.nextTimer) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.active) return;
    this.nextTimer = setTimeout(() => {
      if (!this.active) return;
      const startedAt = Date.now();
      // 이 프레임의 캡처 promise 를 보관 — stop() 이 await 할 수 있게.
      const flight = this.captureFrame();
      this.inFlight = flight;
      flight.then(
        () => {
          if (this.inFlight === flight) this.inFlight = null;
          if (!this.active) return;
          const elapsed = Date.now() - startedAt;
          const wait = Math.max(0, this.intervalMs - elapsed);
          this.scheduleNext(wait);
        },
        (err: unknown) => {
          if (this.inFlight === flight) this.inFlight = null;
          console.error('[asis] scroll capture frame failed', err);
          // 한 프레임 실패해도 계속 — 다음 시도.
          if (this.active) this.scheduleNext(this.intervalMs);
        },
      );
    }, delayMs);
  }

  private async captureFrame(): Promise<void> {
    const r = this.rect;
    const dir = this.framesDir;
    if (!r || !dir) return;
    const framePath = join(dir, frameName(this.frameIndex));
    await runScreencaptureRegion(r, framePath);
    // 파일이 실제로 생성된 뒤에만 인덱스 증가 — stop 시 없는 프레임을 참조하지 않게.
    this.frameIndex += 1;
  }

  private async cleanupDir(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
      console.error('[asis] scroll capture tmp cleanup failed', err);
    });
  }
}

function frameName(index: number): string {
  return `frame_${String(index).padStart(4, '0')}.png`;
}

/**
 * 한 영역을 screencapture -R 로 캡처. `-x` 로 셔터음 없음(연속 캡처라 무음).
 * exit code 판정은 여기서: code≠0 이면 throw(capture.ts 와 달리 취소 개념 없음 —
 * 이건 백그라운드 자동 캡처라 사용자 취소 dialog 가 없다).
 */
async function runScreencaptureRegion(
  rect: { x: number; y: number; w: number; h: number },
  outputPath: string,
): Promise<void> {
  const region = `${rect.x},${rect.y},${rect.w},${rect.h}`;
  const { code, stderr } = await runProcess(
    SCREENCAPTURE_BIN,
    ['-x', '-R', region, '-t', 'png', outputPath],
    'screencapture',
  );
  if (code !== 0) {
    throw new Error(`screencapture 실패 (exit ${code ?? 'null'}): ${stderr}`);
  }
}
