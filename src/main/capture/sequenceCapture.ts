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
   *  기본 100 — screencapture 가 따라가는 만큼 최대속도. */
  intervalMs?: number;
  /** 결과 GIF 의 fps. 기본 10. 실제 캡처 fps 와 비슷하게 잡는 게 자연스러움. */
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
    this.intervalMs = options.intervalMs ?? 100;
    this.fps = options.fps ?? 10;
    this.cursor = options.cursor ?? false;
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
    return this.gif.stop(outputPath, { fps: this.fps });
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
