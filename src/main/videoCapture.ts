import { spawn, type ChildProcess } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

/**
 * 화면 *영상* 녹화 — ffmpeg avfoundation 으로 직접 영상 (mp4) 녹화 후
 * 별도 단계에서 GIF 인코딩 (gif.ts 의 encode 흐름).
 *
 * 시퀀스 GIF (정적 슬라이드쇼) 와 다른 점: 진짜 동영상이라 부드러움. macOS 의
 * `ffmpeg -f avfoundation` 가 ScreenCaptureKit 위에서 동작 — Capture Capability
 * 권한 (Screen Recording) 필요. 우리는 이미 screencapture 로 동일 권한 사용 중.
 *
 * 동작
 *   1) start(rect, fps?) — 임시 mp4 파일 경로로 ffmpeg spawn (영역만 crop)
 *   2) stop() — SIGINT 보내 정상 종료, mp4 path 반환
 *   3) cancel() — SIGKILL + 파일 삭제
 */

if (!ffmpegPath) {
  throw new Error(
    'ffmpeg-static path 가 null — 설치 안 됐거나 platform 미지원',
  );
}
const FFMPEG_BIN = ffmpegPath;

export type VideoStartOptions = {
  rect: { x: number; y: number; w: number; h: number };
  /** 녹화 fps. 기본 24 — 동영상 부드러움. */
  fps?: number;
};

export class VideoCaptureManager {
  private child: ChildProcess | null = null;
  private outputPath: string | null = null;

  /** 녹화 시작 — ffmpeg spawn. start 자체는 sync 이지만 caller 가 await 패턴 사용 편하도록 Promise 반환. */
  start(options: VideoStartOptions): Promise<void> {
    if (this.child) {
      throw new Error('VideoCapture.start() — 이미 녹화 중');
    }
    const { rect } = options;
    const fps = options.fps ?? 24;
    const outputPath = join(
      tmpdir(),
      `asis-video-${Date.now()}-${process.pid}.mp4`,
    );

    // macOS avfoundation 화면 디바이스: 보통 "1" 이 메인 화면 (audio 없이).
    // -framerate 24, -capture_cursor 1 (커서 보이게).
    // crop=w:h:x:y 로 영역만 자름 — 전체 화면 녹화 후 crop 이라 CPU 약간 더 쓰지만
    // 영역만 직접 캡처하는 옵션이 avfoundation 에 없음.
    const args = [
      '-y',
      '-f',
      'avfoundation',
      '-framerate',
      String(fps),
      '-capture_cursor',
      '1',
      '-i',
      '1:none', // video index 1, audio none
      '-vf',
      `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y}`,
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      outputPath,
    ];

    this.outputPath = outputPath;
    const child = spawn(FFMPEG_BIN, args);
    this.child = child;

    // stderr 가 ffmpeg 의 정상 진행 로그도 포함 — 에러만 따로 잡기 어렵.
    // close 이벤트의 exit code 로 판정.
    let stderrTail = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail += chunk.toString('utf8');
      // 메모리 폭발 방지 — 마지막 4KB 만 유지.
      if (stderrTail.length > 4096) {
        stderrTail = stderrTail.slice(-4096);
      }
    });

    child.on('error', (err) => {
      console.error('[asis] ffmpeg spawn 실패', err);
    });

    child.on('close', (code, signal) => {
      this.child = null;
      // SIGINT (정상 종료) 면 code === 255 또는 0 — 모두 OK.
      if (code !== 0 && code !== 255 && signal !== 'SIGINT') {
        console.error(
          `[asis] ffmpeg 비정상 종료 (code=${code} signal=${signal}): ${stderrTail.slice(-500)}`,
        );
      }
    });
    return Promise.resolve();
  }

  /**
   * 녹화 정지 — SIGINT 로 ffmpeg 가 buffer flush + index 작성 후 종료.
   * @returns mp4 파일 경로
   */
  stop(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = this.child;
      const path = this.outputPath;
      if (!child || !path) {
        reject(new Error('VideoCapture.stop() — start() 안 호출됨'));
        return;
      }
      child.once('close', () => resolve(path));
      child.once('error', reject);
      child.kill('SIGINT');
    });
  }

  /** 사용자 취소 — 즉시 kill + 파일 삭제. */
  cancel(): void {
    const child = this.child;
    if (!child) return;
    child.kill('SIGKILL');
    this.child = null;
    if (this.outputPath) {
      const path = this.outputPath;
      this.outputPath = null;
      unlink(path).catch((err: unknown) => {
        if (!isEnoent(err)) console.warn('[asis] videoCapture cancel: tmp cleanup failed', err);
      });
    }
  }

  isRecording(): boolean {
    return this.child !== null;
  }
}

/**
 * mp4 → GIF 변환 (ffmpeg palette 2-pass).
 * gif.ts 의 encodeGif 와 비슷하지만 입력이 영상 파일.
 */
export function encodeGifFromVideo(
  videoPath: string,
  outputPath: string,
  options: { fps?: number; width?: number } = {},
): Promise<void> {
  const fps = options.fps ?? 15;
  const palettePath = `${videoPath}.palette.png`;

  // 1-pass: palette 생성.
  // width 옵션 — 너무 크면 GIF 가 거대. 기본 미지정 → 원본 크기.
  const widthFilter = options.width
    ? `,scale=${options.width}:-1:flags=lanczos`
    : '';
  return runFfmpeg([
    '-y',
    '-i',
    videoPath,
    '-vf',
    `fps=${fps}${widthFilter},palettegen=stats_mode=full`,
    palettePath,
  ]).then(() =>
    // 2-pass: paletteuse 로 GIF.
    runFfmpeg([
      '-y',
      '-i',
      videoPath,
      '-i',
      palettePath,
      '-lavfi',
      `fps=${fps}${widthFilter} [x]; [x][1:v] paletteuse=dither=sierra2_4a`,
      '-loop',
      '0',
      outputPath,
    ]),
  ).then(() => {
    unlink(palettePath).catch((err: unknown) => {
      if (!isEnoent(err)) console.warn('[asis] GIF encode: palette cleanup failed', err);
    });
    unlink(videoPath).catch((err: unknown) => {
      if (!isEnoent(err)) console.warn('[asis] GIF encode: video cleanup failed', err);
    });
  });
}

function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args);
    const stderrChunks: Buffer[] = [];
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', (err) =>
      reject(new Error(`ffmpeg spawn 실패: ${err.message}`)),
    );
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      reject(new Error(`ffmpeg 실패 (exit ${code ?? 'null'}): ${stderr.slice(-500)}`));
    });
  });
}
