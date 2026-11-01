import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { runProcess } from '../runProcess';

/**
 * GIF 인코더 — frame PNG 들의 폴더를 받아 ffmpeg palette 2-pass 로 GIF 생성.
 *
 * 인코딩 흐름
 *   1) 1-pass: palettegen — 입력 프레임의 *공통 256색 팔레트* 추출
 *   2) 2-pass: paletteuse — 그 팔레트로 각 프레임 양자화 → 하나의 GIF
 *
 * 룰
 *   - imperative-style.md: spawn/exit code 처리 명령형 OK
 *   - null-safety.md: ffmpeg path 가 null 이면 명시 throw, exit code 비-0 이면 reject
 */

if (!ffmpegPath) {
  throw new Error(
    'ffmpeg-static path 가 null — 설치 안 됐거나 platform 미지원',
  );
}

// electron-builder 가 app.asar 안의 바이너리를 spawn 할 수 없으므로
// asarUnpack 으로 추출된 app.asar.unpacked 경로로 교정.
const FFMPEG_BIN = ffmpegPath.replace('app.asar', 'app.asar.unpacked');

/** frame PNG 파일명 — ffmpeg 입력 패턴(%04d)과 nextFramePath 의 4자리 0-패딩이 맞아야 한다. */
const FRAME_INPUT_PATTERN = 'frame_%04d.png';
const frameFileName = (index: number): string => `frame_${String(index).padStart(4, '0')}.png`;

export type EncodeOptions = {
  /** GIF 의 frame rate. 기본 10. */
  fps?: number;
  /** 무한 반복(0) / 한 번만(-1). 기본 0. */
  loop?: number;
};

/**
 * frames 폴더 안 frame_*.png → GIF 파일.
 * @returns 생성된 GIF 파일 path
 */
async function encodeGif(
  framesDir: string,
  outputPath: string,
  options: EncodeOptions = {},
): Promise<string> {
  const fps = String(options.fps ?? 10);
  const loop = String(options.loop ?? 0);
  const framesInput = join(framesDir, FRAME_INPUT_PATTERN);

  // 1-pass: palette.png 생성.
  const palettePath = join(framesDir, '__palette.png');
  await runFfmpeg([
    '-y',
    '-framerate', fps,
    '-i', framesInput,
    '-vf', 'palettegen=stats_mode=full',
    palettePath,
  ]);

  // 2-pass: paletteuse 로 GIF 인코딩.
  await runFfmpeg([
    '-y',
    '-framerate', fps,
    '-i', framesInput,
    '-i', palettePath,
    '-lavfi', 'paletteuse=dither=sierra2_4a',
    '-loop', loop,
    outputPath,
  ]);

  return outputPath;
}

async function runFfmpeg(args: string[]): Promise<void> {
  const { code, stderr } = await runProcess(FFMPEG_BIN, args, 'ffmpeg');
  if (code !== 0) {
    throw new Error(`ffmpeg 실패 (exit ${String(code)}): ${stderr}`);
  }
}

/**
 * GIF 녹화 lifecycle 관리 — 임시 폴더 생성, frame 파일 받기, 인코딩, cleanup.
 *
 * .claude/rules/side-effects.md Class 판별:
 *   "이 객체를 React 없이 단위 테스트로 의미 있게 검증할 수 있는가?" → Yes.
 *   파일 시스템 + child process lifecycle — 정확한 Class 케이스.
 */
export class GifManager {
  private framesDir: string | null = null;
  private frameIndex = 0;

  /** 새 녹화 세션 시작 — 임시 폴더 생성. */
  async start(): Promise<void> {
    if (this.framesDir) {
      throw new Error('GifManager.start() — 이미 녹화 중. stop() 먼저.');
    }
    const dir = join(tmpdir(), `asis-gif-${Date.now()}-${process.pid}`);
    await mkdir(dir, { recursive: true });
    this.framesDir = dir;
    this.frameIndex = 0;
  }

  /**
   * 다음 frame 을 쓸 경로를 예약한다(frameIndex 증가). 호출자가 이 path 로 PNG 를 직접 쓴다.
   */
  nextFramePath(): string {
    if (!this.framesDir) {
      throw new Error('GifManager.nextFramePath() — start() 안 호출됨');
    }
    const path = join(this.framesDir, frameFileName(this.frameIndex));
    this.frameIndex += 1;
    return path;
  }

  /** 현재까지 등록된 frame 수. */
  count(): number {
    return this.frameIndex;
  }

  /**
   * 녹화 종료 + GIF 인코딩.
   * @returns 생성된 GIF 파일 path
   */
  async stop(outputPath: string, options: EncodeOptions = {}): Promise<string> {
    if (!this.framesDir) {
      throw new Error('GifManager.stop() — start() 안 호출됨');
    }
    if (this.frameIndex === 0) {
      throw new Error('GifManager.stop() — 등록된 frame 0개');
    }
    const dir = this.framesDir;
    try {
      await encodeGif(dir, outputPath, options);
      return outputPath;
    } finally {
      // 성공/실패 무관하게 임시 폴더 정리.
      this.framesDir = null;
      this.frameIndex = 0;
      rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
        console.error('[asis] gif tmp cleanup failed', err);
      });
    }
  }

  /** 사용자 취소 — frames 폐기 + 인코딩 안 함. */
  async cancel(): Promise<void> {
    if (!this.framesDir) return;
    const dir = this.framesDir;
    this.framesDir = null;
    this.frameIndex = 0;
    await rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
      console.error('[asis] gif cancel cleanup failed', err);
    });
  }
}
