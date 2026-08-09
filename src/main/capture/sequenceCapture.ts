import { GifManager } from './gif';
import { runProcess } from '../runProcess';

const SCREENCAPTURE_BIN = '/usr/sbin/screencapture';

/**
 * 시퀀스 캡처 — 일정 간격(N ms) 으로 macOS `screencapture -R` 호출해
 * 같은 영역의 PNG 시퀀스를 만들고, 정지 시 GIF 인코딩.
 *
 * Snipaste 의 *캡처 히스토리 GIF* 카테고리 + Kap 의 정적 슬라이드쇼 모드.
 * 화면 녹화(A) 와 다른 점: 영상이 아닌 *간헐적 정지 사진* 이라 경량.
 */

export type SequenceOptions = {
  rect: { x: number; y: number; w: number; h: number };
  /** frame 간 *최소* 간격 (ms). 실제로는 screencapture 의 launch latency 가 더 길면 그게 우선.
   *  미지정 시 fps 로부터 계산(1000/fps). */
  intervalMs?: number;
  /** *목표* 캡처 fps. 기본 10. 결과 GIF 의 재생 fps 는 이 값이 아니라 실측값을 쓴다
   *  (playbackFps 주석 참고) — 목표를 못 채워도 1배속으로 재생되게 하기 위함. */
  fps?: number;
  /** 커서를 프레임에 포함할지(screencapture -C, 비대화형 -R 에서만 허용).
   *  기본 false. 스텝 가이드 GIF 처럼 "동작 시연" 은 커서가 보여야 유용해 켠다. */
  cursor?: boolean;
};

export class SequenceCaptureManager {
  private gif = new GifManager();
  private rect: SequenceOptions['rect'] | null = null;
  private intervalMs = 100;
  private fps = 10;
  private cursor = false;
  /** 연속 캡처 루프 active 여부. setTimeout id 또는 'stopping' 으로 표현. */
  private active = false;
  private nextTimer: NodeJS.Timeout | null = null;
  /** 직전 frame 이 *실제로 찍힌* 시각(epoch ms) — 프레임 간격 측정용. */
  private lastFrameAt: number | null = null;
  /** frame 사이 실측 간격(ms) 목록 — 재생 fps 를 여기서 뽑는다. */
  private frameGapsMs: number[] = [];

  /**
   * 녹화 시작 — 첫 frame 즉시 + 이후 *재귀 setTimeout* 으로 연속 캡처.
   * setInterval 대신 재귀를 쓰는 이유: 한 frame 의 screencapture 가 끝나야 다음을
   * 시작 — race 없고, 각 frame 의 *실제 시점* 이 일정해진다.
   */
  async start(options: SequenceOptions): Promise<void> {
    if (this.active) {
      throw new Error('SequenceCapture.start() — 이미 녹화 중');
    }
    this.rect = options.rect;
    this.fps = options.fps ?? 10;
    this.intervalMs = options.intervalMs ?? Math.round(1000 / this.fps);
    this.cursor = options.cursor ?? false;
    this.lastFrameAt = null;
    this.frameGapsMs = [];
    await this.gif.start();
    this.active = true;
    this.scheduleNext(0);
  }

  /** 녹화 정지 + GIF 인코딩. */
  stop(outputPath: string): Promise<string> {
    this.active = false;
    if (this.nextTimer) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }
    // gif.stop() 이 frame 카운트를 리셋하므로 fps 를 *먼저* 계산해 넘긴다.
    return this.gif.stop(outputPath, { fps: this.playbackFps() });
  }

  /**
   * 결과 GIF 의 재생 fps — 목표 fps 가 아니라 *실제로 캡처된 속도*.
   *
   * screencapture 는 프레임마다 프로세스를 새로 띄워 수십~수백 ms 가 걸린다.
   * 그래서 목표 15fps 로 시작해도 실측은 3~6fps 인 경우가 흔하다. 목표 fps 로
   * 인코딩하면 3fps 로 찍힌 장면이 15fps 로 재생돼 5배속처럼 보인다 —
   * "GIF 로 만들면 화면이 빨리 움직인다" 의 원인.
   *
   * 평균이 아니라 *중앙값* 을 쓰는 이유: 첫 spawn 은 콜드스타트로 유독 느리고
   * (실측 600ms 대), 중간에 시스템 지연이 끼면 한두 개의 이상치가 평균을 끌어내려
   * 전체가 느려진다. GIF 는 모든 프레임에 같은 delay 를 쓰므로 대표 간격이 맞다.
   */
  private playbackFps(): number {
    // 간격이 하나도 없으면(프레임 0~1개) 목표 fps 를 그대로 쓴다.
    if (this.frameGapsMs.length === 0) return this.fps;

    const sorted = [...this.frameGapsMs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const lower = sorted[sorted.length % 2 === 0 ? mid - 1 : mid];
    const upper = sorted[mid];
    // 인덱스는 항상 유효하지만(length >= 1) noUncheckedIndexedAccess 대비 명시 검사.
    if (lower === undefined || upper === undefined) {
      throw new Error('playbackFps — 정렬된 간격 배열 인덱스가 비었다');
    }
    const medianGapMs = (lower + upper) / 2;
    if (medianGapMs <= 0) return this.fps;

    // 실측이 목표를 넘을 수는 없지만(최소 간격 보장) 방어적으로 clamp.
    // 하한 0.5fps = 프레임당 2초 — 그보다 느리면 GIF 로서 의미가 없다.
    const clamped = Math.min(this.fps, Math.max(0.5, 1000 / medianGapMs));
    // ffmpeg -framerate 로 넘어가는 값이라 소수 2자리까지만 — GIF delay 는 1/100초 단위다.
    return Math.round(clamped * 100) / 100;
  }

  async cancel(): Promise<void> {
    this.active = false;
    if (this.nextTimer) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }
    await this.gif.cancel();
  }

  isRecording(): boolean {
    return this.active;
  }

  count(): number {
    return this.gif.count();
  }

  private scheduleNext(delay: number): void {
    if (!this.active) return;
    this.nextTimer = setTimeout(() => {
      if (!this.active) return;
      const startedAt = Date.now();
      this.captureFrame().then(
        () => {
          // 실측 재생 속도용 — frame 이 *찍힌* 시각의 간격. 정지 직전 frame 까지
          // 반영되도록 active 검사보다 먼저 기록한다.
          const capturedAt = Date.now();
          if (this.lastFrameAt !== null) {
            this.frameGapsMs.push(capturedAt - this.lastFrameAt);
          }
          this.lastFrameAt = capturedAt;
          if (!this.active) return;
          // 다음 frame 까지 *최소* intervalMs 보장. captureFrame 이 더 오래 걸렸으면 즉시.
          const elapsed = Date.now() - startedAt;
          const wait = Math.max(0, this.intervalMs - elapsed);
          this.scheduleNext(wait);
        },
        (err: unknown) => {
          console.error('[asis] sequence frame failed', err);
          // 한 frame 실패해도 계속 — 다음 시도.
          this.scheduleNext(this.intervalMs);
        },
      );
    }, delay);
  }

  private async captureFrame(): Promise<void> {
    const r = this.rect;
    if (!r) return;
    const framePath = this.gif.nextFramePath();
    await runScreencaptureRegion(r, framePath, this.cursor);
  }
}

async function runScreencaptureRegion(
  rect: { x: number; y: number; w: number; h: number },
  outputPath: string,
  cursor: boolean,
): Promise<void> {
  const region = `${rect.x},${rect.y},${rect.w},${rect.h}`;
  // -C: 커서 포함(비대화형 -R 에서만 허용, man screencapture). 기본 캡처엔 안 넣고
  // 스텝 가이드 GIF 처럼 동작 시연이 필요한 곳만 cursor=true 로 켠다.
  const args = ['-x', '-R', region, '-t', 'png', outputPath];
  if (cursor) args.splice(1, 0, '-C');
  const { code, stderr } = await runProcess(
    SCREENCAPTURE_BIN,
    args,
    'screencapture',
  );
  if (code !== 0) {
    throw new Error(`screencapture 실패 (exit ${code ?? 'null'}): ${stderr}`);
  }
}
