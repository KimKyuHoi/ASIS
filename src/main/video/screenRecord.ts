import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FFMPEG_BIN, clampToDisplay, resolveAvfInput } from './avfoundation';
import { removeTempFile } from './tempFile';
import { tMain } from '../i18n/strings';
import { UserFacingError } from '../userFacingError';


/** stdin 'q' 정지 후 close 가 오지 않을 때 강제 종료까지의 최대 대기(ms). */
const STOP_TIMEOUT_MS = 5000;
/** 녹화 프레임레이트. */
const FPS = 30;
/** libx264 품질 (낮을수록 고화질). 18 = 시각적 무손실에 가까움. */
const CRF = 18;

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * 녹화 엔진.
 * - ffmpeg: avfoundation + libx264(crf) — 화질·비트레이트를 제어한다. 평소 영역 녹화.
 * - screencapture: macOS `screencapture -v` — setContentProtection 창(알약·영역 테두리)을
 *   프레임에서 빼 준다(2026-11-02 실측: 보호 창 픽셀 미기록, 보호 해제 시 기록). 그래서 영역 밖에
 *   알약 둘 자리가 없는 전체화면 녹화에서 알약을 영역 안에 띄울 수 있다.
 */
export type RecordEngine = 'ffmpeg' | 'screencapture';

const SCREENCAPTURE_BIN = '/usr/sbin/screencapture';

/** 엔진별 프로세스 실행 방법과 정상 정지 방법. */
type SpawnSpec = {
  bin: string;
  args: string[];
  /** 파일을 마무리하는 정상 정지 요청 (ffmpeg: stdin 'q', screencapture: SIGINT). */
  requestStop: (child: ChildProcessWithoutNullStreams) => void;
};

/**
 * 화면 영상 녹화 — 기본은 ffmpeg avfoundation 캡처 + libx264(crf) 인코딩.
 *
 * 평소엔 screencapture -v 를 쓰지 않는다: 비트레이트/품질 옵션이 없어 동적 화면에서
 * 저비트레이트 blur 가 발생한 적이 있다(2026-07 실측). ffmpeg avfoundation + crf 로 고화질 제어.
 * Retina 는 물리 해상도로 캡처되고, 영역은 -vf crop 으로 물리 픽셀 기준 잘라낸다.
 * 단, ffmpeg 는 보호 창도 찍으므로 알약을 영역 밖에 둘 수 없는 전체화면 녹화만
 * screencapture 엔진을 쓴다 (RecordEngine 참고).
 *
 * side-effects.md Rule 3 — 장기 프로세스 lifecycle 은 Class.
 * 정지는 ffmpeg stdin 에 'q' 를 써서 정상 종료(moov atom 기록)시킨다.
 */
export class ScreenRecordManager {
  // stdio 기본값 'pipe' 로 spawn 하므로 stdin/stderr 는 항상 존재한다.
  private child: ChildProcessWithoutNullStreams | null = null;
  private outputPath: string | null = null;
  /** stop()/cancel() 로 정상 종료 요청했는지 — 조기 사망(권한 거부 등) 과 구분. */
  private stopping = false;
  /** stop 전에 프로세스가 스스로 죽었을 때 그 사유. */
  private earlyExit: { code: number | null; stderr: string } | null = null;
  private stderrBuf = '';
  /** 지금 녹화 중인 엔진의 정상 정지 방법 — start 가 정한다. */
  private requestStop: SpawnSpec['requestStop'] | null = null;
  /**
   * 녹화 세대. cancel()/stop() 이 올린다. start() 는 디스플레이 계산·spawn 을 기다리는 동안
   * child 가 아직 null 이라 그 사이 온 취소가 no-op 이 된다 — 늦게 뜬 ffmpeg 가 창 없이 계속
   * 녹화하는 고아가 되지 않도록, start 는 기다림이 끝날 때마다 세대를 확인하고 바뀌었으면 스스로 정리한다.
   */
  private generation = 0;
  /**
   * 녹화 도중 ffmpeg 가 스스로 죽었을 때(권한 거부·잘못된 crop 등) 바로 알릴 곳.
   * 진짜 옵셔널이다 — 미설정이면 기존처럼 다음 stop() 이 사유를 돌려준다.
   */
  onEarlyExit: ((error: Error) => void) | null = null;

  isRecording(): boolean {
    return this.child !== null;
  }

  /**
   * 녹화 시작 — 프로세스 기동까지만 기다리고 resolve (녹화는 계속 진행).
   * rect 는 전역 논리 좌표. ffmpeg 는 속한 디스플레이의 avfoundation 입력 + 물리 crop 을 계산하고,
   * screencapture 는 디스플레이 경계로 자른 논리 rect 를 -R 로 넘긴다.
   */
  async start(rect: Rect, engine: RecordEngine = 'ffmpeg'): Promise<void> {
    if (this.child) {
      throw new Error('ScreenRecord.start() — 이미 녹화 중');
    }
    // 이전 녹화가 스스로 죽은 뒤 정리되지 않았다면(일부만 기록된 .mov·earlyExit) 지금 지운다 —
    // 남겨 두면 tmp 에 누수되고, 이번 녹화를 시작 대기 중에 정지했을 때 "취소" 가 아니라
    // 지난 녹화의 실패로 보고된다.
    if (this.outputPath) {
      const stale = this.outputPath;
      this.reset();
      removeTempFile(stale).catch((err: unknown) => {
        console.warn('[asis] 지난 녹화의 임시 파일 정리 실패', err);
      });
    }
    const generation = this.generation;
    const outputPath = join(tmpdir(), `asis-video-${String(Date.now())}.mov`);
    const spec = await spawnSpecFor(engine, rect, outputPath);
    if (generation !== this.generation) throw startCanceledError();

    return new Promise<void>((resolve, reject) => {
      const child = spawn(spec.bin, spec.args);

      // Promise 는 한 번만 settle 된다 — 'spawn' 뒤 늦게 온 'error' 의 reject 는 무시되고
      // 상태 정리(reset)만 반영된다.
      child.once('error', (err) => {
        // 늦게 온 error 가 그 사이 시작된 *다음* 녹화의 상태를 지우지 않게 — 이 프로세스가
        // 지금 녹화일 때만 정리한다(spawn 전 실패는 아직 붙인 상태가 없다).
        if (this.child === child) this.reset();
        reject(err);
      });

      child.once('spawn', () => {
        if (typeof child.pid !== 'number') {
          reject(new Error('ffmpeg spawn 성공했으나 pid 없음'));
          return;
        }
        if (generation !== this.generation) {
          // spawn 을 기다리는 사이 취소·정지됨 — 붙이지 않고 바로 죽이고 임시 파일을 지운다.
          child.kill('SIGKILL');
          removeTempFile(outputPath).catch((err: unknown) => {
            console.warn('[asis] 취소된 녹화의 임시 파일 정리 실패', err);
          });
          reject(startCanceledError());
          return;
        }
        this.reset();
        this.child = child;
        this.outputPath = outputPath;
        this.requestStop = spec.requestStop;
        resolve();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        this.stderrBuf += chunk.toString();
      });

      child.once('close', (code) => {
        // stop()/cancel() 가 부른 종료는 각 호출 쪽에서 처리.
        // stop 전에 스스로 죽은 경우(권한 거부 등) 만 기록한다.
        // cancel() 의 SIGKILL close 가 reset() 뒤 늦게 오면 이미 *다음* 녹화가 돌고 있을 수
        // 있다 — 이 close 가 지금 녹화의 프로세스일 때만 반영한다.
        if (this.child === child && !this.stopping) {
          const exit = { code, stderr: this.stderrBuf };
          this.earlyExit = exit;
          this.child = null;
          // 알약 타이머가 계속 돌다가 정지를 눌러야 실패를 알게 되지 않도록 즉시 알린다.
          this.onEarlyExit?.(earlyExitError(exit));
        }
      });
    });
  }

  /**
   * 정지 — 엔진별 정상 종료(moov atom 기록) 를 요청한 뒤 .mov 경로 반환.
   * 파일 stat(존재 + 크기>0) 로 성공 판정.
   */
  stop(): Promise<string> {
    const child = this.child;
    const outputPath = this.outputPath;
    const requestStop = this.requestStop;
    if (!child || !outputPath || !requestStop) {
      // 시작 대기 중에 온 정지 — 진행 중인 start 가 늦게 ffmpeg 를 붙이지 않게 한다.
      this.generation += 1;
      if (this.earlyExit) {
        const error = earlyExitError(this.earlyExit);
        this.reset();
        return Promise.reject(error);
      }
      // 시작 대기 중(avfoundation 조회·spawn) 의 정지 — 사용자 의도는 "취소" 다.
      return Promise.reject(startCanceledError());
    }

    this.stopping = true;

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.reset();
        fn();
      };

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        // 응답 없는 ffmpeg 가 남긴 (깨졌을 수 있는) .mov 는 쓸 수 없다 — 지운다.
        removeTempFile(outputPath).catch((err: unknown) => {
          console.warn('[asis] 정지 시간 초과 녹화의 임시 파일 정리 실패', err);
        });
        finish(() =>
          reject(new UserFacingError(
            tMain().video.errors.stopTimeout,
            '녹화 정지 타임아웃 — ffmpeg 가 응답하지 않음',
          )),
        );
      }, STOP_TIMEOUT_MS);

      child.once('close', () => {
        stat(outputPath).then(
          ({ size }) => {
            finish(() => {
              if (size > 0) resolve(outputPath);
              else reject(new UserFacingError(tMain().video.errors.emptyFile, '녹화 파일이 비어 있음 — 캡처 실패'));
            });
          },
          (err: unknown) => {
            finish(() => {
              reject(verifyFailedError(err));
            });
          },
        );
      });

      // 프로세스가 막 죽은 직후(close 전) 라면 stdin 쓰기가 EPIPE 를 낸다 — 리스너가 없으면
      // main 의 uncaught exception 이 된다. 결과는 위 close·timeout 경로가 정한다.
      child.stdin.on('error', (err) => {
        console.warn('[asis] 녹화 프로세스 stdin 쓰기 실패(이미 종료됨)', err);
      });
      requestStop(child);
    });
  }

  /** 취소 — 강제 종료하고 임시 파일 폐기. */
  async cancel(): Promise<void> {
    const child = this.child;
    const outputPath = this.outputPath;
    // 시작 대기 중인 start 도 무효로 만든다(늦게 뜬 ffmpeg 는 start 쪽이 스스로 정리).
    this.generation += 1;
    this.stopping = true;
    child?.kill('SIGKILL');
    // 녹화 중이 아니면 child·outputPath 가 null — 정리할 것이 없다.
    if (outputPath) await removeTempFile(outputPath);
    this.reset();
  }

  private reset(): void {
    this.child = null;
    this.outputPath = null;
    this.stopping = false;
    this.earlyExit = null;
    this.stderrBuf = '';
    this.requestStop = null;
  }
}

/** 시작 대기 중 취소·정지됨 — 호출측은 이미 결과를 settle 했으므로 사용자에게 보이지 않는다. */
/** 시작 대기 중 취소·정지로 끝났는지 — 호출측이 failed 대신 canceled 로 처리한다. */
export function isStartCanceled(err: unknown): boolean {
  return err instanceof Error && err.name === 'StartCanceled';
}

function startCanceledError(): Error {
  const error = new Error('ScreenRecord.start() — 시작 대기 중 취소됨');
  error.name = 'StartCanceled';
  return error;
}

/** 엔진별 실행 인자와 정지 방법. ffmpeg 는 avfoundation 장치 조회(수백 ms)를 기다린다. */
async function spawnSpecFor(
  engine: RecordEngine,
  rect: Rect,
  outputPath: string,
): Promise<SpawnSpec> {
  if (engine === 'screencapture') {
    const { left, top, right, bottom } = clampToDisplay(rect).area;
    const region = [left, top, right - left, bottom - top].map((n) => String(Math.round(n))).join(',');
    return {
      bin: SCREENCAPTURE_BIN,
      // -v 영상, -x 소리 없음, -C 커서 포함, -R 전역 논리 좌표 영역. SIGINT 로 정상 종료한다
      // (2026-11-02 실측: exit 0, h264 .mov 정상 기록).
      args: ['-v', '-x', '-C', `-R${region}`, outputPath],
      requestStop: (child) => child.kill('SIGINT'),
    };
  }
  const { input, crop } = await resolveAvfInput(rect);
  return {
    bin: FFMPEG_BIN,
    args: recordArgs(input, crop, outputPath),
    // ffmpeg 정상 종료 — stdin 'q'. SIGINT 도 되지만 'q' 가 공식 정지 방법.
    requestStop: (child) => {
      child.stdin.write('q');
      child.stdin.end();
    },
  };
}

/** ffmpeg 녹화 인자 — avfoundation 입력 → 물리 crop → libx264(crf) .mov. */
function recordArgs(input: number, crop: Rect, outputPath: string): string[] {
  return [
    '-hide_banner',
    '-f', 'avfoundation',
    '-capture_cursor', '1',
    '-framerate', String(FPS),
    '-i', `${String(input)}:none`,
    // 출력 CFR 강제 — avfoundation 은 프레임레이트를 무시하고 폭주하므로 필수.
    '-r', String(FPS),
    '-vsync', 'cfr',
    '-vf', `crop=${String(crop.w)}:${String(crop.h)}:${String(crop.x)}:${String(crop.y)}`,
    '-c:v', 'libx264',
    '-crf', String(CRF),
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];
}

/** stop 전에 ffmpeg 가 스스로 죽은 경우(권한 거부 등) — stderr 끝 3줄을 detail 로. */
function earlyExitError(exit: { code: number | null; stderr: string }): UserFacingError {
  const tail = exit.stderr.trim().split('\n').slice(-3).join(' ');
  return new UserFacingError(
    tMain().video.errors.exitedEarly,
    `녹화가 시작 직후 종료됨 (code ${String(exit.code)}): ${tail || '사유 불명'}`,
  );
}

/** 결과 파일 stat 실패 — 원문 메시지는 detail 로만 남긴다. */
function verifyFailedError(err: unknown): UserFacingError {
  return err instanceof Error
    ? new UserFacingError(tMain().video.errors.verifyFailed, err.message)
    : new UserFacingError(tMain().video.errors.verifyFailed);
}
