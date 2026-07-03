import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * Vision 헬퍼(Swift) 바이너리 경로.
 *   - prod: extraResources 로 앱 번들 Resources/asis-ocr.
 *   - dev : 프로젝트 resources/bin/asis-ocr (pnpm build:ocr 산출물).
 */
function ocrBinaryPath(): string {
  const prod = join(process.resourcesPath, 'asis-ocr');
  if (existsSync(prod)) return prod;
  return join(app.getAppPath(), 'resources', 'bin', 'asis-ocr');
}

/**
 * asis-ocr 헬퍼를 spawn 해 stdout 을 모아 반환.
 *
 * runProcess(one-shot, stderr 만 수집) 를 쓰지 않는 이유: 결과가 stdout 이라
 * 직접 spawn 해서 stdout 을 모은다. 바이너리 부재/비정상 종료는 명시 reject.
 */
function runVision(args: string[], label: string): Promise<string> {
  const bin = ocrBinaryPath();
  if (!existsSync(bin)) {
    // null-safety — 조용히 빈 문자열 반환하지 않고 원인을 드러낸다.
    return Promise.reject(
      new Error(
        `${label} 바이너리를 찾을 수 없습니다: ${bin} — 'pnpm build:ocr' 를 실행하세요`,
      ),
    );
  }
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args);
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;

    child.stdout.on('data', (c: Buffer) => outChunks.push(c));
    child.stderr.on('data', (c: Buffer) => errChunks.push(c));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} spawn 실패: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve(Buffer.concat(outChunks).toString('utf8'));
        return;
      }
      const stderr = Buffer.concat(errChunks).toString('utf8').trim();
      reject(new Error(`${label} 실패 (exit ${code ?? 'null'}): ${stderr}`));
    });
  });
}

/** 이미지에서 텍스트를 인식해 반환 (macOS Vision, 한국어+영어). */
export function recognizeText(imagePath: string): Promise<string> {
  return runVision([imagePath], 'OCR');
}

/** 이미지에서 QR/바코드 payload 를 인식해 반환 (macOS Vision). */
export function recognizeBarcode(imagePath: string): Promise<string> {
  return runVision(['--barcode', imagePath], '바코드 인식');
}
