import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from './runProcess';

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

/** 전체화면 캡처 (메인 모니터만). 다중 모니터는 v2. */
export function captureFullscreen(): Promise<CaptureResult> {
  return captureToFile(['-x', '-m', '-t', 'png']);
}

/**
 * 윈도우 캡처. `-w` = 윈도우 모드만 허용 (사용자 space 키로 영역 모드 전환 불가).
 * 사용자가 ESC 로 취소하면 { kind: 'canceled' } 반환.
 */
export function captureWindow(): Promise<CaptureResult> {
  return captureToFile(['-x', '-w', '-t', 'png']);
}

/**
 * 윈도우 ID 캡처. CGWindowID 로 특정 윈도우만 잡는다.
 * `-o`: window capture mode 에서 shadow 를 PNG 에 포함하지 않는다.
 */
export function captureWindowById(windowId: number): Promise<CaptureResult> {
  return captureToFile(['-x', '-l', String(windowId), '-o', '-t', 'png']);
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
  return captureToFile(['-x', '-R', region, '-t', 'png']);
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
    (err as { code: unknown }).code === 'ENOENT'
  );
}
