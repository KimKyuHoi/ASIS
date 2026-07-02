import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { screen } from 'electron';
import ffmpegPath from 'ffmpeg-static';
import { runProcess } from '../runProcess';

/**
 * 타임머신(섀도우) 녹화 — ffmpeg avfoundation 으로 화면을 *상시 연속 녹화* 하며
 * segment muxer 링버퍼(`-f segment -segment_wrap`)로 최근 N초만 디스크에 유지한다.
 * 단축키 저장 시 유지된 세그먼트를 시간 순으로 concat(stream copy) 해서 .mp4 를 만든다.
 *
 * 구현 근거 (실측)
 *   - `-segment_wrap K` 는 K 개 세그먼트를 순환하며 오래된 파일을 덮어써 링버퍼가 된다.
 *     저장 시점의 파일명 순서 != 시간 순서이므로, concat 은 파일명이 아니라 *mtime*
 *     으로 정렬해야 한다 (fs stat 의 mtimeMs 는 ms 이하 정밀도라 2초 간격 세그먼트를
 *     안전하게 구분한다 — 실측 확인).
 *   - 저장 시 ffmpeg 가 *현재 쓰고 있는* 세그먼트는 moov atom 이 아직 없어 concat 하면
 *     깨진다. 그래서 "가장 최신 mtime 세그먼트 1개"는 제외한다. 이 때문에 실제 저장
 *     길이는 요청한 N초보다 최대 (segment_time) 만큼 짧을 수 있다 (정직한 한계).
 *   - concat 은 재인코딩 없이 stream copy 라 즉시 끝난다 (실측 2000x 이상).
 *
 * screenRecord.ts 와 형제 구조 — 같은 avfoundation 입력 해석/CFR 강제/짝수 crop 로직을
 * 쓰되, "정지 후 저장"이 아니라 "상시 녹화 + 임의 시점 스냅샷"이 다르다.
 *
 * side-effects.md Rule 3 — 장기 프로세스 lifecycle 은 Class. React 무관.
 */

if (!ffmpegPath) {
  throw new Error('ffmpeg-static path 가 null — 설치 안 됐거나 platform 미지원');
}
// electron-builder 가 app.asar 안 바이너리를 spawn 할 수 없어 unpacked 경로로 교정
// (gif.ts / screenRecord.ts 와 동일).
const FFMPEG_BIN = ffmpegPath.replace('app.asar', 'app.asar.unpacked');

/** 녹화 프레임레이트. */
const FPS = 30;
/**
 * 세그먼트 1개 길이(초). 짧을수록 저장 시 버려지는 "쓰는 중" 세그먼트 손실이 작지만
 * 파일 개폐가 잦아진다. 2초가 실측상 손실/부하 균형점.
 */
const SEGMENT_SECONDS = 2;
/**
 * 유지할 최근 시간(초). 링버퍼 세그먼트 수 = ceil(N / SEGMENT_SECONDS) + 1.
 * +1 은 "현재 쓰는 중" 세그먼트를 항상 1개 여유로 두어, 저장 시 그것을 제외해도
 * 요청한 N초가 확보되도록 하기 위함.
 */
const DEFAULT_BUFFER_SECONDS = 30;
/**
 * libx264 품질. 상시 녹화라 screenRecord(crf 18) 보다 낮은 품질로 부하/디스크를 낮춘다.
 * 23 = 시각적으로 충분, 파일 크기 절감.
 */
const CRF = 23;
/** stop() 시 ffmpeg 가 'q' 에 응답하지 않을 때 강제 종료까지 최대 대기(ms). */
const STOP_TIMEOUT_MS = 5000;

export type Rect = { x: number; y: number; w: number; h: number };

/** 링버퍼에 유지된 세그먼트 1개의 메타 — 시간 정렬·DRM 검사 대상. */
export type Segment = { path: string; mtimeMs: number };

/**
 * save() 결과. discriminated union (`| {...} |` 스타일).
 *   - saved:   concat 성공, 임시 .mp4 경로(호출자가 최종 위치로 옮긴 뒤 정리 책임).
 *   - empty:   아직 완성된 세그먼트가 없음(막 시작). 저장할 게 없다.
 */
export type TimeMachineSaveResult =
  | { kind: 'saved'; path: string; segmentCount: number; approxSeconds: number } |
  { kind: 'empty' };

export class TimeMachineManager {
  private child: ChildProcess | null = null;
  /** 세그먼트가 쌓이는 디렉토리. running 동안만 유효. */
  private bufferDir: string | null = null;
  /** stop() 로 정상 종료 요청했는지 — 조기 사망(권한 거부 등)과 구분. */
  private stopping = false;
  /** 시작 직후 스스로 죽었을 때(권한 거부 등)의 사유. */
  private earlyExit: { code: number | null; stderr: string } | null = null;
  private stderrBuf = '';
  /** 유지할 버퍼 길이(초). start() 인자로 덮어쓸 수 있다. */
  private bufferSeconds = DEFAULT_BUFFER_SECONDS;

  isRunning(): boolean {
    return this.child !== null;
  }

  /** 현재 설정된 버퍼 길이(초). */
  getBufferSeconds(): number {
    return this.bufferSeconds;
  }

  /**
   * 상시 녹화 시작 — 프로세스 기동까지만 기다리고 resolve (녹화는 계속 진행).
   * @param rect          녹화 영역(전역 논리 좌표). 미지정 시 커서가 있는 디스플레이 전체.
   * @param bufferSeconds 유지할 최근 초. 미지정 시 DEFAULT_BUFFER_SECONDS.
   */
  async start(rect?: Rect, bufferSeconds?: number): Promise<void> {
    if (this.child) {
      throw new Error('TimeMachine.start() — 이미 실행 중');
    }
    // bufferSeconds 가 0 이하이면 의미가 없다 — silent 보정하지 않고 명시 throw.
    if (bufferSeconds !== undefined && bufferSeconds <= 0) {
      throw new Error(`TimeMachine.start() — bufferSeconds 는 양수여야 함: ${bufferSeconds}`);
    }
    this.bufferSeconds = bufferSeconds ?? DEFAULT_BUFFER_SECONDS;

    const target = rect ?? cursorDisplayRect();
    const { input, crop } = await resolveAvfInput(target);
    const dir = join(tmpdir(), `asis-timemachine-${Date.now()}-${process.pid}`);
    await mkdir(dir, { recursive: true });

    // 링버퍼 세그먼트 수: 필요한 개수 + 1(현재 쓰는 중 여유분).
    const wrap = Math.ceil(this.bufferSeconds / SEGMENT_SECONDS) + 1;
    const pattern = join(dir, 'seg_%04d.mp4');
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
      // avfoundation 은 지정 framerate 를 무시하고 폭주하므로 출력 CFR 강제(screenRecord.ts 와 동일).
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
      // 세그먼트 경계에서 잘라 붙이려면 각 세그먼트가 keyframe 으로 시작해야 한다.
      // GOP 를 세그먼트 길이에 맞춰 강제 → concat/DRM 프레임 추출이 안정적.
      '-g',
      String(FPS * SEGMENT_SECONDS),
      '-force_key_frames',
      `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
      '-f',
      'segment',
      '-segment_time',
      String(SEGMENT_SECONDS),
      '-segment_wrap',
      String(wrap),
      '-reset_timestamps',
      '1',
      '-segment_format',
      'mp4',
      pattern,
    ];

    return new Promise<void>((resolve, reject) => {
      const child = spawn(FFMPEG_BIN, args);
      let settledStart = false;

      child.once('error', (err: unknown) => {
        // 시작 실패 — 만든 버퍼 디렉토리 정리(비동기, 실패해도 치명적이지 않음).
        const failedDir = dir;
        rm(failedDir, { recursive: true, force: true }).catch((e: unknown) => {
          console.warn('[asis] timemachine start-fail cleanup', e);
        });
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
        this.bufferDir = dir;
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
        // stop()/dispose() 가 부른 종료는 각 호출 쪽에서 처리.
        // 그 전에 스스로 죽은 경우(권한 거부 등)만 기록해 다음 save/stop 이 사유를 알린다.
        if (!this.stopping) {
          this.earlyExit = { code, stderr: this.stderrBuf };
          this.child = null;
        }
      });
    });
  }

  /**
   * 현재 링버퍼에 완성된 세그먼트 목록을 mtime 오름차순(오래된→최신)으로 반환.
   * "현재 쓰는 중"으로 추정되는 *가장 최신* 세그먼트는 제외한다 (moov 미완성).
   *
   * 저장/DRM 검사가 공통으로 쓰는 진실의 원천.
   */
  async listSegments(): Promise<Segment[]> {
    if (!this.bufferDir) {
      throw new Error('TimeMachine.listSegments() — 실행 중이 아님');
    }
    const dir = this.bufferDir;
    const names = await readdir(dir);
    // stat 실패(막 wrap 되며 삭제/재생성 중)한 파일은 건너뛴다 — race 방어.
    // 세그먼트가 많을 수 있어 순차 await 대신 병렬 stat 후 취합한다.
    const entries = await Promise.all(
      names
        .filter((name) => name.startsWith('seg_') && name.endsWith('.mp4'))
        .map(async (name) => {
          const full = join(dir, name);
          const info = await stat(full).catch(() => null);
          if (!info || info.size <= 0) return null;
          return { path: full, mtimeMs: info.mtimeMs };
        }),
    );
    const segs: Segment[] = entries.filter((e): e is Segment => e !== null);
    segs.sort((a, b) => a.mtimeMs - b.mtimeMs);
    // 가장 최신 = ffmpeg 가 지금 쓰는 중일 가능성이 높다 → 제외.
    if (segs.length > 0) segs.pop();
    return segs;
  }

  /**
   * 최근 buffer 구간을 하나의 .mp4(임시 파일)로 concat 해 경로를 반환한다.
   * 재인코딩 없이 stream copy — 즉시 완료.
   *
   * @returns saved(경로 + 세그먼트 수 + 대략 길이) 또는 empty(저장할 세그먼트 없음).
   *          반환된 임시 파일의 최종 이동/삭제는 *호출자 책임*.
   */
  async save(): Promise<TimeMachineSaveResult> {
    if (!this.bufferDir) {
      // earlyExit 가 있으면 왜 죽었는지 알린다 (silent 실패 금지).
      if (this.earlyExit) {
        const e = this.earlyExit;
        const tail = e.stderr.trim().split('\n').slice(-3).join(' ');
        this.reset();
        throw new Error(
          `타임머신이 종료된 상태입니다 (code ${e.code ?? 'null'}): ${tail || '사유 불명 — 화면 녹화 권한 확인 필요'}`,
        );
      }
      throw new Error('TimeMachine.save() — 실행 중이 아님');
    }

    const segs = await this.listSegments();
    if (segs.length === 0) {
      return { kind: 'empty' };
    }

    // concat demuxer 용 리스트 파일. 경로에 개행/따옴표가 없으므로 안전하지만
    // safe 0 로 절대경로를 허용한다.
    const listPath = join(this.bufferDir, `__concat-${Date.now()}.txt`);
    const listBody = `${segs.map((s) => `file '${s.path}'`).join('\n')}\n`;
    await writeFile(listPath, listBody, 'utf8');

    const outPath = join(tmpdir(), `asis-timemachine-out-${Date.now()}.mp4`);
    const { code, stderr } = await runProcess(
      FFMPEG_BIN,
      [
        '-hide_banner',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        outPath,
      ],
      'ffmpeg(concat)',
    );
    // 리스트 파일은 성공/실패 무관 정리.
    await rm(listPath, { force: true }).catch(() => undefined);

    if (code !== 0) {
      throw new Error(`타임머신 concat 실패 (exit ${code ?? 'null'}): ${stderr}`);
    }
    const info = await stat(outPath).catch((err: unknown) => {
      throw new Error(
        `타임머신 저장 파일 확인 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    if (info.size <= 0) {
      await rm(outPath, { force: true }).catch(() => undefined);
      throw new Error('타임머신 저장 파일이 비어 있음 — concat 결과 없음');
    }

    return {
      kind: 'saved',
      path: outPath,
      segmentCount: segs.length,
      approxSeconds: segs.length * SEGMENT_SECONDS,
    };
  }

  /**
   * 정지 — ffmpeg stdin 에 'q' 를 써서 정상 종료 후 버퍼 디렉토리를 폐기한다.
   * (타임머신은 "정지 = 버퍼 폐기"가 기본. 저장하려면 stop 전에 save() 를 부른다.)
   */
  stop(): Promise<void> {
    const child = this.child;
    const dir = this.bufferDir;
    if (!child) {
      // 이미 죽어 있으면 남은 디렉토리만 정리하고 조용히 성공.
      if (dir) {
        this.reset();
        return rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
          console.warn('[asis] timemachine stop cleanup(dead)', err);
        });
      }
      return Promise.resolve();
    }

    this.stopping = true;

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const toRemove = dir;
        this.reset();
        if (toRemove) {
          rm(toRemove, { recursive: true, force: true })
            .catch((err: unknown) => {
              console.warn('[asis] timemachine stop cleanup', err);
            })
            .finally(() => resolve());
          return;
        }
        resolve();
      };

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish();
      }, STOP_TIMEOUT_MS);

      child.once('close', () => finish());

      if (child.stdin) {
        child.stdin.write('q');
        child.stdin.end();
      } else {
        child.kill('SIGINT');
      }
    });
  }

  /**
   * 강제 폐기 — 앱 종료(before-quit) 경로용. 프로세스 즉시 kill + 디렉토리 정리.
   * stop()의 'q' 정상 종료를 기다릴 수 없는 종료 순간에 쓴다.
   */
  dispose(): void {
    this.stopping = true;
    if (this.child) {
      this.child.kill('SIGKILL');
    }
    const dir = this.bufferDir;
    this.reset();
    if (dir) {
      rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
        console.warn('[asis] timemachine dispose cleanup', err);
      });
    }
  }

  private reset(): void {
    this.child = null;
    this.bufferDir = null;
    this.stopping = false;
    this.earlyExit = null;
    this.stderrBuf = '';
  }
}

/** 커서가 있는 디스플레이 전체 영역(전역 논리 좌표). start(rect 미지정) 기본값. */
function cursorDisplayRect(): Rect {
  const cursor = screen.getCursorScreenPoint();
  const d = screen.getDisplayNearestPoint(cursor);
  return { x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height };
}

/**
 * rect 가 속한 디스플레이 → avfoundation 입력 인덱스 + 물리 crop 좌표.
 * screenRecord.ts 의 동명 로직과 동일한 규칙 (짝수 crop, scaleFactor 반영).
 * 공통 배선 파일을 수정하지 않기 위해 여기 자체 구현으로 둔다(중복 허용 — 형제 모듈).
 */
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
 * avfoundation "Capture screen N" 항목의 ffmpeg 입력 인덱스를 screen 번호 순서대로 반환.
 * 카메라 수가 환경마다 달라 screen 시작 인덱스가 가변이므로 -list_devices 파싱한다
 * (screenRecord.ts 와 동일 — list_devices 는 입력이 없어 exit≠0 이지만 목록은 stderr).
 */
async function avfoundationScreenIndices(): Promise<number[]> {
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
  return result;
}
