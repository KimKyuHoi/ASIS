import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * 이미지 배경 제거 헬퍼(Swift + Vision) 실행 래퍼.
 *
 * macOS 14+ 의 VNGenerateForegroundInstanceMaskRequest 로 전경(피사체) 마스크를
 * 구해 배경을 투명하게(alpha) 만든 PNG 를 *출력 경로에 파일로* 저장한다.
 *
 * 설계 근거 (src/main/ocr/ocr.ts 패턴을 따르되 결과를 discriminated union 으로)
 *   - OCR 은 결과가 stdout 텍스트라 문자열을 resolve 했다. 배경 제거는 결과가
 *     PNG 파일이라 output 경로를 미리 정해 넘기고, 성공 시 그 경로를 돌려준다.
 *   - "피사체 없음"(Swift exit 5) 은 *에러가 아니라 정상적인 도메인 결과* 이므로
 *     reject 하지 않고 { kind: 'no-subject' } 로 구분한다 (null-safety: 조용히
 *     빈 결과로 뭉개지 않고 호출자가 명시 분기하게 한다).
 *   - 그 외 비정상 종료(바이너리 부재/입력 오류/Vision 실패)는 reject.
 *
 * 룰
 *   - side-effects.md — 프로세스 spawn 은 lifecycle 없는 모듈 함수. Class 불필요.
 *   - imperative-style.md — main process 모듈 함수, 명령형 OK.
 *   - null-safety.md — 바이너리 부재/비정상 종료를 명시 reject, 빈 catch 금지.
 */

/** VNGenerateForegroundInstanceMaskRequest 최소 요구 버전. */
export const BG_REMOVE_MIN_MACOS_MAJOR = 14;

export type BackgroundRemoveResult =
  | { kind: 'success'; path: string } |
  { kind: 'no-subject' };

/**
 * Swift 헬퍼 바이너리 경로.
 *   - prod: extraResources 로 앱 번들 Resources/asis-bgremove.
 *   - dev : 프로젝트 resources/bin/asis-bgremove (pnpm build:bgremove 산출물).
 */
function bgRemoveBinaryPath(): string {
  const prod = join(process.resourcesPath, 'asis-bgremove');
  if (existsSync(prod)) return prod;
  return join(app.getAppPath(), 'resources', 'bin', 'asis-bgremove');
}

/**
 * 현재 실행 중인 macOS 가 배경 제거를 지원하는지(14+) 여부.
 *
 * process.getSystemVersion() 은 "14.5.0" 같은 문자열을 반환한다(Electron/Node).
 * major 만 파싱해 14 이상인지 본다. 파싱 실패는 지원 안 함으로 보수적 처리.
 * https://www.electronjs.org/docs/latest/api/process (getSystemVersion)
 */
export function isBackgroundRemoveSupported(): boolean {
  if (process.platform !== 'darwin') return false;
  const version = process.getSystemVersion();
  const major = Number.parseInt(version.split('.')[0], 10);
  if (Number.isNaN(major)) return false;
  return major >= BG_REMOVE_MIN_MACOS_MAJOR;
}

/**
 * inputPath 이미지의 배경을 제거해 outputPath 에 투명 PNG 로 저장한다.
 *
 * @param inputPath  원본 이미지(캡처 PNG) 절대 경로
 * @param outputPath 결과를 저장할 PNG 절대 경로 (호출자가 tmp 경로를 정해 넘긴다)
 *
 * 임시 파일 정리(input/output unlink)는 *호출자 책임*.
 */
export function removeBackground(
  inputPath: string,
  outputPath: string,
): Promise<BackgroundRemoveResult> {
  const bin = bgRemoveBinaryPath();
  if (!existsSync(bin)) {
    // null-safety — 조용히 넘기지 않고 원인을 드러낸다.
    return Promise.reject(
      new Error(
        `배경 제거 바이너리를 찾을 수 없습니다: ${bin} — 'pnpm build:bgremove' 를 실행하세요`,
      ),
    );
  }

  return new Promise<BackgroundRemoveResult>((resolve, reject) => {
    const child = spawn(bin, [inputPath, outputPath]);
    const errChunks: Buffer[] = [];
    let settled = false;

    child.stderr.on('data', (c: Buffer) => errChunks.push(c));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`배경 제거 spawn 실패: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve({ kind: 'success', path: outputPath });
        return;
      }
      // Swift 헬퍼 exit code 계약 (asis-bgremove.swift 상단 주석과 일치):
      //   5 = 전경 인스턴스 없음(피사체 못 찾음) → 에러 아님, 도메인 결과.
      if (code === 5) {
        resolve({ kind: 'no-subject' });
        return;
      }
      const stderr = Buffer.concat(errChunks).toString('utf8').trim();
      reject(new Error(`배경 제거 실패 (exit ${code ?? 'null'}): ${stderr}`));
    });
  });
}
