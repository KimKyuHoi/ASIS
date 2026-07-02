import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * OCR 헬퍼(Swift + Vision) 바이너리 경로.
 *   - prod: extraResources 로 앱 번들 Resources/asis-ocr.
 *   - dev : 프로젝트 resources/bin/asis-ocr (pnpm build:ocr 산출물).
 */
function ocrBinaryPath(): string {
  const prod = join(process.resourcesPath, 'asis-ocr');
  if (existsSync(prod)) return prod;
  return join(app.getAppPath(), 'resources', 'bin', 'asis-ocr');
}

/**
 * 이미지 파일에서 텍스트를 인식해 반환 (macOS Vision, 한국어+영어).
 *
 * runProcess(one-shot, stderr 만 수집) 를 쓰지 않는 이유: OCR 결과가 stdout 이라
 * 직접 spawn 해서 stdout 을 모은다. 바이너리 부재/비정상 종료는 명시 reject.
 */
export function recognizeText(imagePath: string): Promise<string> {
  const bin = ocrBinaryPath();
  if (!existsSync(bin)) {
    // null-safety — 조용히 빈 문자열 반환하지 않고 원인을 드러낸다.
    return Promise.reject(
      new Error(
        `OCR 바이너리를 찾을 수 없습니다: ${bin} — 'pnpm build:ocr' 를 실행하세요`,
      ),
    );
  }
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, [imagePath]);
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;

    child.stdout.on('data', (c: Buffer) => outChunks.push(c));
    child.stderr.on('data', (c: Buffer) => errChunks.push(c));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`OCR spawn 실패: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve(Buffer.concat(outChunks).toString('utf8'));
        return;
      }
      const stderr = Buffer.concat(errChunks).toString('utf8').trim();
      reject(new Error(`OCR 실패 (exit ${code ?? 'null'}): ${stderr}`));
    });
  });
}
