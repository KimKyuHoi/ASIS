import { spawn, type ChildProcess } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { UserFacingError } from '../userFacingError';
import { tGifStudio } from './strings';

/**
 * GIF 스튜디오 ffmpeg 실행기 — 취소 가능한 단일 프로세스 래퍼.
 *
 * runProcess(../runProcess) 는 취소 수단이 없어서, 창을 닫거나 사용자가 [취소] 를
 * 누를 때 ffmpeg 를 죽여야 하는 이 기능에는 맞지 않는다.
 */

if (!ffmpegPath) {
  throw new UserFacingError(
    tGifStudio().ffmpegUnavailable,
    'ffmpeg-static path 가 null — 설치 안 됐거나 platform 미지원',
  );
}

// capture/gif.ts 와 같은 교정 — electron-builder 패키징 후 app.asar 안의 바이너리는
// spawn 할 수 없으므로 asarUnpack 으로 풀린 app.asar.unpacked 경로를 쓴다.
const FFMPEG_BIN = ffmpegPath.replace('app.asar', 'app.asar.unpacked');

export class FfmpegCanceledError extends Error {
  constructor() {
    super('ffmpeg 작업이 취소되었다.');
    this.name = 'FfmpegCanceledError';
  }
}

/** 사용자에게 알릴 단계 이름 — strings.ts 의 ffmpegStep 키. */
export type FfmpegStep = 'export' | 'preview' | 'filmstrip';

export type FfmpegOutput = {
  code: number | null;
  stderr: string;
};

/**
 * 한 번에 하나의 ffmpeg 프로세스를 소유한다. cancel() 은 실행 중인 프로세스를
 * SIGKILL 하고, 그 run() 은 FfmpegCanceledError 로 reject 된다.
 */
export class FfmpegJob {
  private child: ChildProcess | null = null;
  private canceled = false;

  isRunning(): boolean {
    return this.child !== null;
  }

  /** exit code 와 stderr 를 그대로 돌려준다. code 판정은 호출자 몫 (probe 는 비-0 이 정상). */
  run(args: string[]): Promise<FfmpegOutput> {
    if (this.child) {
      return Promise.reject(new Error('FfmpegJob.run — 이미 실행 중인 ffmpeg 가 있다.'));
    }
    this.canceled = false;
    return new Promise((resolve, reject) => {
      const child = spawn(FFMPEG_BIN, args);
      this.child = child;
      const chunks: Buffer[] = [];
      let settled = false;

      child.stderr.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      child.once('error', (err) => {
        if (settled) return;
        settled = true;
        this.child = null;
        reject(new UserFacingError(tGifStudio().ffmpegUnavailable, `ffmpeg spawn 실패: ${err.message}`));
      });

      child.once('close', (code) => {
        if (settled) return;
        settled = true;
        this.child = null;
        if (this.canceled) {
          reject(new FfmpegCanceledError());
          return;
        }
        resolve({ code, stderr: Buffer.concat(chunks).toString('utf8').trim() });
      });
    });
  }

  /** 성공(exit 0)이 아니면 throw — 사용자 문구는 사전, stderr 끝부분은 로그용 detail. */
  async runOrThrow(args: string[], step: FfmpegStep): Promise<void> {
    const { code, stderr } = await this.run(args);
    if (code !== 0) {
      const t = tGifStudio();
      const tail = stderr.split('\n').slice(-4).join(' ');
      throw new UserFacingError(
        t.ffmpegFailed(t.ffmpegStep[step]),
        `ffmpeg ${step} exit ${code ?? 'null'}: ${tail || '사유 불명'}`,
      );
    }
  }

  cancel(): void {
    if (!this.child) return;
    this.canceled = true;
    this.child.kill('SIGKILL');
  }
}
