import log from 'electron-log/main';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runProcess } from '../runProcess';
import { UserFacingError } from '../userFacingError';
import { encodePng, loadFrame } from './frameIo';
import { captureRegion, type Rect } from './regionCapture';
import { computeRowInfo, type Frame, type RowInfo } from './rowProfile';
import { cropColumns, detectScrollColumns, type Columns } from './scrollColumns';
import { tScroll } from './strings';

export type { Rect } from './regionCapture';

const SCREENCAPTURE_BIN = '/usr/sbin/screencapture';
const SHOT_RETRIES = 2;
const SHOT_RETRY_DELAY_MS = 150;

/** 한 번 찍은 프레임 — 메모리의 전체 영역 픽셀 + (열 범위로 자른) 매칭용 행 요약. */
export type Shot = { frame: Frame; info: RowInfo };

/**
 * 캡처 영역 하나를 반복해서 찍는 소스.
 *
 * 찍은 프레임은 메모리에만 둔다 — 대부분은 비교만 하고 버린다. 결과에 들어갈 프레임만
 * persist() 로 PNG 를 써 두고, 합성 때 load() 로 다시 읽는다(긴 캡처에서 원본 픽셀을
 * 메모리에 쌓지 않기 위해). 캡처는 in-process(regionCapture, ~17ms) 를 먼저 쓰고, 실패하면
 * screencapture(~115ms) 로 폴백한다.
 *
 * 룰: side-effects.md — child process + 파일 lifecycle 은 Class. 폴더 정리는 소유자
 * (ScrollCaptureManager) 책임이다.
 */
export class FrameSource {
  private seq = 0;
  /** 스크롤되는 열만 쓸 때의 범위(px). null = 전체 폭. */
  private columns: Columns | null = null;
  private columnsLocked = false;
  /** in-process 캡처가 한 번 실패하면 이후 screencapture 로 고정. */
  private useScreencapture = false;

  constructor(
    private readonly dir: string,
    private readonly rect: Rect,
  ) {}

  /** 한 장 찍기. 일시적인 실패는 SHOT_RETRIES 번까지 다시 시도한다. */
  async shot(attempt = 0): Promise<Shot> {
    try {
      const frame = await this.capture();
      return { frame, info: computeRowInfo(this.crop(frame)) };
    } catch (err) {
      if (attempt >= SHOT_RETRIES) throw err;
      log.warn('[scroll] frame capture failed — retry', err);
      await delay(SHOT_RETRY_DELAY_MS);
      return this.shot(attempt + 1);
    }
  }

  /** 결과에 들어갈 프레임을 PNG 로 써 두고 그 경로(스티처 키) 를 돌려준다. 파일은 전체 영역. */
  async persist(shot: Shot): Promise<string> {
    const path = this.nextPath();
    await writeFile(path, encodePng(shot.frame));
    return path;
  }

  /** persist 한 프레임을 읽어 스크롤 열 범위로 자른다(합성용). */
  load(path: string): Frame {
    return this.crop(loadFrame(path));
  }

  /** 스크롤 열 범위가 확정됐는지 — 확정 후에는 다시 판정하지 않는다. */
  hasLockedColumns(): boolean {
    return this.columnsLocked;
  }

  /**
   * 첫 움직임의 두 프레임으로 스크롤 열 범위를 정한다(고정 사이드바 배제, scrollColumns.ts).
   * 범위가 잘리면 두 프레임의 행 요약을 그 범위로 다시 계산해 돌려준다 — 호출측은 스티처를
   * 이 first 로 다시 시작해야 한다. 판정 불가면 null(확정하지 않음 — 다음 움직임에서 재시도).
   */
  lockColumns(first: Shot, next: Shot): { first: Shot; next: Shot; cropped: boolean } | null {
    const found = detectScrollColumns(first.frame, next.frame);
    if (found === null) return null;
    this.columnsLocked = true;
    if (found === 'full') {
      log.info('[scroll] columns: full width');
      return { first, next, cropped: false };
    }
    this.columns = found;
    log.info(`[scroll] columns: ${String(found.x0)}..${String(found.x1)} of ${String(first.frame.width)}px`);
    return {
      first: { frame: first.frame, info: computeRowInfo(this.crop(first.frame)) },
      next: { frame: next.frame, info: computeRowInfo(this.crop(next.frame)) },
      cropped: true,
    };
  }

  /**
   * 열 판정 없이 전체 폭으로 확정 — 판정이 늦어져 이미 전체 폭으로 이은 프레임이 있을 때.
   * 그때 범위를 바꾸면 스티처를 다시 시작해야 해서 앞쪽(페이지 상단) 이음이 사라진다.
   */
  lockFullWidth(): void {
    if (this.columnsLocked) return;
    this.columnsLocked = true;
    log.info('[scroll] columns: full width (판정 전에 이미 이음이 생김)');
  }

  private crop(frame: Frame): Frame {
    return this.columns ? cropColumns(frame, this.columns) : frame;
  }

  private nextPath(): string {
    const path = join(this.dir, `frame_${String(this.seq).padStart(4, '0')}.png`);
    this.seq += 1;
    return path;
  }

  private async capture(): Promise<Frame> {
    if (!this.useScreencapture) {
      const frame = await captureRegion(this.rect);
      if (frame) return frame;
      log.warn('[scroll] in-process capture unavailable — screencapture 로 전환');
      this.useScreencapture = true;
    }
    const path = this.nextPath();
    try {
      await runScreencaptureRegion(this.rect, path);
      return loadFrame(path);
    } finally {
      await unlinkQuiet(path);
    }
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function unlinkQuiet(path: string): Promise<void> {
  await unlink(path).catch((err: unknown) => {
    // 이미 지워진 파일은 정상 — 그 외만 기록.
    if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
      log.warn('[scroll] frame cleanup failed', err);
    }
  });
}

/**
 * 한 영역을 screencapture -R 로 캡처. `-x` 로 셔터음 없음(연속 캡처라 무음).
 * 커서는 기본적으로 찍히지 않는다(-C 를 주지 않음).
 */
async function runScreencaptureRegion(rect: Rect, outputPath: string): Promise<void> {
  const region = `${rect.x},${rect.y},${rect.w},${rect.h}`;
  const { code, stderr } = await runProcess(
    SCREENCAPTURE_BIN,
    ['-x', '-R', region, '-t', 'png', outputPath],
    'screencapture',
  );
  if (code !== 0) {
    throw new UserFacingError(
      tScroll().captureFailed,
      `screencapture 실패 (exit ${code === null ? 'null' : String(code)}): ${stderr}`,
    );
  }
}
