import { spawn, type ChildProcess } from 'node:child_process';
import { stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { screen } from 'electron';
import ffmpegPath from 'ffmpeg-static';
import { runProcess } from '../runProcess';

if (!ffmpegPath) {
  throw new Error('ffmpeg-static path 가 null — 설치 안 됐거나 platform 미지원');
}
// electron-builder 가 app.asar 안 바이너리를 spawn 할 수 없어 unpacked 경로로 교정 (gif.ts 와 동일).
const FFMPEG_BIN = ffmpegPath.replace('app.asar', 'app.asar.unpacked');

/** stdin 'q' 정지 후 close 가 오지 않을 때 강제 종료까지의 최대 대기(ms). */
const STOP_TIMEOUT_MS = 5000;
/** 녹화 프레임레이트. */
const FPS = 30;
/** libx264 품질 (낮을수록 고화질). 18 = 시각적 무손실에 가까움. */
const CRF = 18;

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * 화면 영상 녹화 — ffmpeg avfoundation 캡처 + libx264(crf) 인코딩.
 *
 * screencapture -v 를 쓰지 않는 이유: 비트레이트/품질 옵션이 없어 동적 화면에서
 * 저비트레이트 blur 가 발생한다(실측 확인). ffmpeg avfoundation + crf 로 고화질 제어.
 * Retina 는 물리 해상도로 캡처되고, 영역은 -vf crop 으로 물리 픽셀 기준 잘라낸다.
 *
 * side-effects.md Rule 3 — 장기 프로세스 lifecycle 은 Class.
 * 정지는 ffmpeg stdin 에 'q' 를 써서 정상 종료(moov atom 기록)시킨다.
 */
export class ScreenRecordManager {
  private child: ChildProcess | null = null;
  private outputPath: string | null = null;
  /** stop()/cancel() 로 정상 종료 요청했는지 — 조기 사망(권한 거부 등) 과 구분. */
  private stopping = false;
  /** stop 전에 프로세스가 스스로 죽었을 때 그 사유. */
  private earlyExit: { code: number | null; stderr: string } | null = null;
  private stderrBuf = '';

  isRecording(): boolean {
    return this.child !== null;
  }

  /**
   * 녹화 시작 — 프로세스 기동까지만 기다리고 resolve (녹화는 계속 진행).
   * rect 는 전역 논리 좌표. 속한 디스플레이를 찾아 avfoundation 입력 + 물리 crop 을 계산한다.
   */
  async start(rect: Rect): Promise<void> {
    if (this.child) {
      throw new Error('ScreenRecord.start() — 이미 녹화 중');
    }
    const { input, crop } = await resolveAvfInput(rect);
    const outputPath = join(tmpdir(), `asis-video-${Date.now()}.mov`);
    const args = [
      '-hide_banner',
      '-f',
      'avfoundation',
      '-capture_cursor',
      '1',
      '-framerate',
      String(FPS),
      '-i',
      `${input}:none`,
      // 출력 CFR 강제 — avfoundation 은 프레임레이트를 무시하고 폭주하므로 필수.
      '-r',
      String(FPS),
      '-vsync',
      'cfr',
      '-vf',
      `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`,
      '-c:v',
      'libx264',
      '-crf',
      String(CRF),
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    ];

    return new Promise<void>((resolve, reject) => {
      const child = spawn(FFMPEG_BIN, args);
      let settledStart = false;

      child.once('error', (err: unknown) => {
        this.reset();
        if (!settledStart) {
          settledStart = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });

      child.once('spawn', () => {
        if (typeof child.pid !== 'number') {
          if (!settledStart) {
            settledStart = true;
            reject(new Error('ffmpeg spawn 성공했으나 pid 없음'));
          }
          return;
        }
        this.child = child;
        this.outputPath = outputPath;
        this.stopping = false;
        this.earlyExit = null;
        this.stderrBuf = '';
        settledStart = true;
        resolve();
      });

      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer) => {
          this.stderrBuf += chunk.toString();
        });
      }

      child.once('close', (code) => {
        // stop()/cancel() 가 부른 종료는 각 호출 쪽에서 처리.
        // stop 전에 스스로 죽은 경우(권한 거부 등) 만 기록한다.
        if (!this.stopping) {
          this.earlyExit = { code, stderr: this.stderrBuf };
          this.child = null;
        }
      });
    });
  }

  /**
   * 정지 — ffmpeg stdin 에 'q' 를 써서 정상 종료(moov atom 기록) 후 .mov 경로 반환.
   * 파일 stat(존재 + 크기>0) 로 성공 판정.
   */
  stop(): Promise<string> {
    const child = this.child;
    const outputPath = this.outputPath;
    if (!child || !outputPath) {
      if (this.earlyExit) {
        const e = this.earlyExit;
        this.reset();
        const tail = e.stderr.trim().split('\n').slice(-3).join(' ');
        return Promise.reject(
          new Error(
            `녹화가 시작 직후 종료됨 (code ${e.code ?? 'null'}): ${tail || '사유 불명 — 화면 녹화 권한 확인 필요'}`,
          ),
        );
      }
      return Promise.reject(new Error('ScreenRecord.stop() — 녹화 중이 아님'));
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
        finish(() =>
          reject(new Error('녹화 정지 타임아웃 — ffmpeg 가 응답하지 않음')),
        );
      }, STOP_TIMEOUT_MS);

      child.once('close', () => {
        stat(outputPath).then(
          (info) => {
            if (info.size <= 0) {
              finish(() => reject(new Error('녹화 파일이 비어 있음 — 캡처 실패')));
              return;
            }
            finish(() => resolve(outputPath));
          },
          (err: unknown) => {
            finish(() =>
              reject(
                err instanceof Error
                  ? new Error(`녹화 파일 확인 실패: ${err.message}`)
                  : new Error('녹화 파일 확인 실패'),
              ),
            );
          },
        );
      });

      // ffmpeg 정상 종료 — stdin 'q'. SIGINT 도 되지만 'q' 가 공식 정지 방법.
      if (child.stdin) {
        child.stdin.write('q');
        child.stdin.end();
      } else {
        child.kill('SIGINT');
      }
    });
  }

  /** 취소 — 강제 종료하고 임시 파일 폐기. */
  async cancel(): Promise<void> {
    const child = this.child;
    const outputPath = this.outputPath;
    this.stopping = true;
    if (child) {
      child.kill('SIGKILL');
    }
    if (outputPath) {
      await unlink(outputPath).catch((err: unknown) => {
        if (!isEnoent(err)) console.warn('[asis] video tmp cleanup failed', err);
      });
    }
    this.reset();
  }

  private reset(): void {
    this.child = null;
    this.outputPath = null;
    this.stopping = false;
    this.earlyExit = null;
    this.stderrBuf = '';
  }
}

/** rect 가 속한 디스플레이 → avfoundation 입력 인덱스 + 물리 crop 좌표. */
async function resolveAvfInput(
  rect: Rect,
): Promise<{ input: number; crop: Rect }> {
  const display = screen.getDisplayMatching({
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
  });
  const displays = screen.getAllDisplays();
  const displayIdx = displays.findIndex((d) => d.id === display.id);
  if (displayIdx < 0) {
    throw new Error('rect 에 매칭되는 디스플레이를 찾지 못함');
  }
  const screenIndices = await avfoundationScreenIndices();
  const input = screenIndices[displayIdx];
  if (input === undefined) {
    throw new Error(
      `avfoundation 화면 입력 매핑 실패 (display ${displayIdx}/${displays.length}, screens ${screenIndices.length})`,
    );
  }
  const sf = display.scaleFactor || 1;
  const b = display.bounds;
  // libx264 yuv420p 는 crop 폭·높이가 짝수여야 한다. offset 도 chroma 안전을 위해 짝수화.
  const even = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);
  const crop: Rect = {
    w: even(Math.round(rect.w * sf)),
    h: even(Math.round(rect.h * sf)),
    x: Math.max(0, Math.floor(((rect.x - b.x) * sf) / 2) * 2),
    y: Math.max(0, Math.floor(((rect.y - b.y) * sf) / 2) * 2),
  };
  return { input, crop };
}

/**
 * avfoundation 인덱스 캐시 — `-list_devices` spawn 은 장치 열거로 수백 ms 걸려서
 * 매 녹화 시작마다 하면 "선택 완료 → 녹화 시작" 사이 지연이 된다.
 * 디스플레이 구성(id 목록)이 바뀌면 stale 이므로 signature 로 무효화한다.
 * (카메라 추가/제거로도 인덱스가 밀릴 수 있지만 디스플레이 signature 만 추적 —
 * 녹화 도중이 아닌 캡처 사이에 카메라가 바뀌는 케이스는 드물고, 그때는
 * 디스플레이도 함께 재열거하는 warm 경로가 대부분 다시 탄다.)
 */
let avfIndicesCache: { signature: string; indices: number[] } | null = null;

function displaySignature(): string {
  return screen.getAllDisplays().map((d) => d.id).join(',');
}

/**
 * 영역 선택이 뜨는 동안 미리 호출해 두는 warm-up — 사용자가 영역을 고르는
 * 수 초 사이에 장치 열거가 끝나므로 녹화 시작 시 spawn 을 생략할 수 있다.
 * 실패는 무시 — start() 경로의 avfoundationScreenIndices() 가 다시 시도한다.
 */
export function warmAvfoundationIndices(): void {
  avfoundationScreenIndices().catch(() => {
    // 여기서 로그까지 남기면 start() 실패와 이중 보고 — start() 쪽이 사용자에게 표면화한다.
  });
}

/**
 * avfoundation "Capture screen N" 항목의 ffmpeg 입력 인덱스를 screen 번호 순서대로 반환.
 *
 * 카메라 수가 환경마다 달라(내장/iPhone/외장 등) screen 시작 인덱스가 가변이므로
 * `-list_devices` 를 파싱한다. electron getAllDisplays() 순서 = CGDisplay(screen N)
 * 순서로 가정하고 인덱스를 매칭한다.
 *
 * list_devices 는 입력이 없어 exit code 가 0 이 아니지만 목록은 stderr 로 나온다
 * (runProcess 는 code 를 판정하지 않고 stderr 를 그대로 준다).
 */
async function avfoundationScreenIndices(): Promise<number[]> {
  const signature = displaySignature();
  if (avfIndicesCache && avfIndicesCache.signature === signature) {
    return avfIndicesCache.indices;
  }
  const { stderr } = await runProcess(FFMPEG_BIN, [
    '-f',
    'avfoundation',
    '-list_devices',
    'true',
    '-i',
    '',
  ]);
  const byScreen: Record<number, number> = {};
  for (const line of stderr.split('\n')) {
    const m = line.match(/\[(\d+)\] Capture screen (\d+)/);
    if (m) byScreen[Number(m[2])] = Number(m[1]);
  }
  const result: number[] = [];
  for (let i = 0; byScreen[i] !== undefined; i++) {
    result.push(byScreen[i]);
  }
  // 파싱 결과가 비면 캐시하지 않는다 — 일시적 실패(권한 프롬프트 등)를 고착시키지 않기 위해.
  if (result.length > 0) {
    avfIndicesCache = { signature, indices: result };
  }
  return result;
}

function isEnoent(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
