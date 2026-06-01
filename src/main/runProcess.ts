import { spawn } from 'node:child_process';

/**
 * 자식 프로세스 spawn 공통 래퍼 — stderr 수집 + 종료 대기.
 *
 * 책임 분리
 *   - spawn 자체 실패('error' 이벤트) → reject. 호출자가 try/catch.
 *   - 정상 종료('close') → exit code + stderr 를 그대로 resolve.
 *     exit code 의 의미 판정은 *호출자 책임*. screencapture 처럼 비-0 이
 *     "사용자 취소"일 수도 있어 여기서 단정하지 않는다.
 *
 * 룰
 *   - imperative-style.md — 모듈 함수 + 명령형 OK (lifecycle 없음).
 *   - null-safety.md — code 는 null 가능(시그널 종료). 호출자가 명시 분기.
 */

export type ProcessResult = {
  /** exit code. 시그널로 종료되면 null. */
  code: number | null;
  /** trim 된 stderr 전체. */
  stderr: string;
};

/**
 * @param bin   실행 바이너리 절대 경로
 * @param args  인자 배열
 * @param label 에러 메시지에 쓸 사람이 읽을 이름 (기본: bin 경로 그대로)
 */
export function runProcess(
  bin: string,
  args: string[],
  label = bin,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    const stderrChunks: Buffer[] = [];
    let settled = false;

    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    // 'error' 와 'close' 가 모두 올 수 있으므로 한 번만 settle.
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} spawn 실패: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      resolve({
        code,
        stderr: Buffer.concat(stderrChunks).toString('utf8').trim(),
      });
    });
  });
}
