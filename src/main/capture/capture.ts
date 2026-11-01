import { stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { screen } from 'electron';
import log from 'electron-log/main';
import { runProcess } from '../runProcess';
import { loadMisc } from '../settings';
import { stitchDisplays, type DisplayShot } from './stitchDisplays';

/**
 * macOS `screencapture` 자식 프로세스 래퍼 — *임시 PNG 파일 path 반환*.
 *
 * Phase 3 변경: 이전에는 직접 클립보드까지 복사했지만 (`captureToClipboard`),
 * 이제는 PNG path 만 반환한다. 이후 EditorWindowManager 가 그 path 를 받아
 * 어노테이션 에디터를 띄우고, 사용자가 어노테이션 후 "복사" 누를 때
 * 합성 결과를 클립보드에 복사한다 (책임 분리).
 *
 * 임시 파일 정리는 *호출자 책임* — 보통 EditorWindow 가 닫힐 때 unlink.
 *
 * 룰
 *   - imperative-style.md — 모듈 함수 + 명령형 OK (lifecycle 없음).
 *   - null-safety.md — exit code/stderr/파일/사용자 취소를 명시 분기.
 *
 * 사용
 *   const result = await captureFullscreen();
 *   if (result.kind === 'success') editorWindow.show(result.path);
 */

const SCREENCAPTURE_BIN = '/usr/sbin/screencapture';

export type CaptureResult =
  | { kind: 'success'; path: string } |
  { kind: 'canceled' };

/**
 * 캡처 완료음 — 설정 ON 이면 macOS 네이티브 셔터음('찰칵')을 그대로 쓴다.
 * `man screencapture`: "-x  Do not play sounds." → '-x' 를 생략하면 셔터음 재생.
 * 셔터음은 시스템 사운드 이펙트 라우팅을 따르므로 기본 출력이 HDMI 모니터여도
 * 사용자가 설정한 이펙트 장치(보통 내장 스피커)로 들린다.
 * GIF 시퀀스 캡처(sequenceCapture.ts)는 자체 '-x' 호출이라 영향 없음.
 */
function soundArgs(): string[] {
  return loadMisc().captureSound ? [] : ['-x'];
}

/**
 * screencapture 콜드스타트 warm-up — 앱 구동 후 *첫* spawn 은 바이너리 로드 +
 * ScreenCaptureKit/TCC 초기화로 오래 걸린다 (실측: cold 629ms vs warm ~110ms).
 * 앱 시작 시 2x2px 캡처를 한 번 치러 두면 첫 실제 캡처가 warm 속도로 시작한다.
 */
export function warmScreencapture(): void {
  const tmpPath = join(tmpdir(), `asis-warm-${process.pid}.png`);
  runProcess(SCREENCAPTURE_BIN, ['-x', '-R', '0,0,2,2', '-t', 'png', tmpPath], 'screencapture')
    .catch(() => {
      // warm-up 실패는 첫 캡처가 느려질 뿐 — 실제 캡처 경로가 에러를 표면화한다.
    })
    .finally(() =>
      unlink(tmpPath).catch(() => {
        // 파일 미생성(ENOENT) 포함 정리 실패는 무해 — tmpdir 이라 OS 가 정리한다.
      }));
}

/** 전체화면 캡처 (메인 모니터만). 다중 모니터는 v2. */
export function captureFullscreen(): Promise<CaptureResult> {
  return captureToFile([...soundArgs(), '-m', '-t', 'png']);
}

/**
 * 윈도우 캡처. `-w` = 윈도우 모드만 허용 (사용자 space 키로 영역 모드 전환 불가).
 * 사용자가 ESC 로 취소하면 { kind: 'canceled' } 반환.
 */
export function captureWindow(): Promise<CaptureResult> {
  return captureToFile([...soundArgs(), '-w', '-t', 'png']);
}

/**
 * 윈도우 ID 캡처. CGWindowID 로 특정 윈도우만 잡는다.
 * `-o`: window capture mode 에서 shadow 를 PNG 에 포함하지 않는다.
 */
export function captureWindowById(windowId: number): Promise<CaptureResult> {
  return captureToFile([...soundArgs(), '-l', String(windowId), '-o', '-t', 'png']);
}

/**
 * 영역 캡처. `-R x,y,w,h` 는 *포인트 단위* (top-left 기준).
 * 좌표 변환은 호출자 책임 — 이 함수는 변환된 값만 받는다.
 */
export function captureRegion(rect: {
  x: number;
  y: number;
  w: number;
  h: number;
}): Promise<CaptureResult> {
  const region = `${rect.x},${rect.y},${rect.w},${rect.h}`;
  return captureToFile([...soundArgs(), '-R', region, '-t', 'png']);
}

/**
 * 연결된 모든 디스플레이를 실제 배치대로 한 장의 PNG 로 캡처.
 *
 * 합집합 rect 를 `-R` 한 번에 넘기지 않는 이유: 실측(macOS 26)에서 `-R` 은
 * 디스플레이 밖 영역을 잘라낸다 (`-R -100,-100,300,300` → 200x200pt 만 반환).
 * 여러 디스플레이에 걸친 rect 의 합성 여부는 문서에 없다. 그래서 디스플레이마다
 * 자기 bounds 로 `-R` 캡처(기존 captureRegion 과 같은 경로)를 병렬 실행하고
 * stitchDisplays 로 합성한다. 파일 순서 ↔ 디스플레이 매핑 문제도 생기지 않는다.
 *
 * 디스플레이 1개면 captureRegion 과 완전히 같은 결과 (합성 없음).
 */
export function captureAllDisplays(): Promise<CaptureResult> {
  return captureDisplays(screen.getAllDisplays().map((d) => d.id));
}

/**
 * 지정한 디스플레이들(Electron `Display.id`)만 실제 배치대로 한 장의 PNG 로 캡처.
 * 1개면 그 디스플레이만 (합성 없음), 여러 개면 stitchDisplays 로 합성한다.
 * 셔터음은 첫 캡처에만 — N번 겹쳐 울리지 않게 나머지는 '-x'.
 *
 * 빈 배열·중복 id·현재 연결되지 않은 id 는 호출자 버그로 보고 throw 한다
 * (설정에 저장된 id 의 모니터가 빠진 경우의 폴백은 호출자가 결정).
 */
export async function captureDisplays(displayIds: number[]): Promise<CaptureResult> {
  if (displayIds.length === 0) {
    throw new Error('captureDisplays: displayIds 가 비어 있음');
  }
  if (new Set(displayIds).size !== displayIds.length) {
    throw new Error(`captureDisplays: 중복된 displayId — ${displayIds.join(',')}`);
  }
  const connected = screen.getAllDisplays();
  const displays = displayIds.map((id) => {
    const found = connected.find((d) => d.id === id);
    if (!found) {
      throw new Error(`captureDisplays: 연결되지 않은 displayId ${id}`);
    }
    return found;
  });
  if (displays.length === 1) {
    const b = displays[0].bounds;
    return captureRegion({ x: b.x, y: b.y, w: b.width, h: b.height });
  }

  const stamp = `${Date.now()}-${process.pid}`;
  const shots: DisplayShot[] = displays.map((d, i) => ({
    path: join(tmpdir(), `asis-cap-${stamp}-d${i}.png`),
    bounds: d.bounds,
    scaleFactor: d.scaleFactor,
  }));
  const partPaths = shots.map((s) => s.path);

  try {
    // 병렬 실행 — 디스플레이 간 캡처 시각 차이를 줄인다. 하나가 실패해도
    // 나머지가 끝날 때까지 기다려야 finally 에서 부분 파일을 모두 지울 수 있다.
    const settled = await Promise.allSettled(
      shots.map((s, i) => {
        const b = s.bounds;
        const region = `${b.x},${b.y},${b.width},${b.height}`;
        const sound = i === 0 ? soundArgs() : ['-x'];
        return runScreencapture([...sound, '-R', region, '-t', 'png'], s.path);
      }),
    );
    for (const r of settled) {
      if (r.status === 'rejected') throw r.reason;
    }
    // -R 은 대화형이 아니라 취소가 정상 흐름이 아니지만, verifyResult 가
    // canceled 를 돌려주면 그 판정을 그대로 존중한다.
    if (settled.some((r) => r.status === 'fulfilled' && r.value.kind === 'canceled')) {
      return { kind: 'canceled' };
    }

    const outputPath = join(tmpdir(), `asis-cap-${stamp}.png`);
    try {
      await stitchDisplays(shots, outputPath);
    } catch (err) {
      await removeQuietly(outputPath);
      throw err;
    }
    return await verifyResult(0, '', outputPath);
  } finally {
    await Promise.all(partPaths.map(removeQuietly));
  }
}

async function removeQuietly(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    // 캡처 실패로 파일이 아예 안 생긴 경우(ENOENT)는 정상. 그 외는 로그만 —
    // finally/catch 에서 throw 하면 성공 결과나 원래 에러를 덮어쓴다. tmpdir 이라 OS 가 정리한다.
    if (!isFileNotFound(err)) log.warn('[asis] capture temp cleanup failed', path, err);
  }
}

function captureToFile(args: string[]): Promise<CaptureResult> {
  const tmpPath = join(
    tmpdir(),
    `asis-cap-${Date.now()}-${process.pid}.png`,
  );
  return runScreencapture(args, tmpPath);
}

async function runScreencapture(
  args: string[],
  outputPath: string,
): Promise<CaptureResult> {
  const { code, stderr } = await runProcess(
    SCREENCAPTURE_BIN,
    [...args, outputPath],
    'screencapture',
  );
  return verifyResult(code, stderr, outputPath);
}

async function verifyResult(
  code: number | null,
  stderr: string,
  outputPath: string,
): Promise<CaptureResult> {
  // exit 0 + stderr 없음 = 성공 후보. 파일 검증 후 path 반환.
  if (code === 0 && !stderr) {
    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(outputPath);
    } catch (err) {
      // ENOENT = 파일 미생성 (사용자 취소 추정). 그 외는 진짜 에러.
      // size 체크의 throw 가 이 catch 에 잡히지 않도록 stat 호출만 감싼다.
      if (isFileNotFound(err)) {
        return { kind: 'canceled' };
      }
      throw new Error(
        `screencapture stat failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (fileStat.size === 0) {
      throw new Error(`screencapture produced empty file: ${outputPath}`);
    }
    return { kind: 'success', path: outputPath };
  }

  // exit code != 0 또는 stderr 있음.
  // stderr 비어 있으면 사용자 취소 (man page 미명시 휴리스틱).
  if (!stderr) {
    return { kind: 'canceled' };
  }
  throw new Error(`screencapture failed (exit ${code ?? 'null'}): ${stderr}`);
}

function isFileNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    err.code === 'ENOENT'
  );
}
