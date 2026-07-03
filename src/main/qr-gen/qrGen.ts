import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * QR 생성 헬퍼(Swift) 바이너리 경로. src/main/ocr/ocr.ts 의 경로 해석과 동일.
 *   - prod: extraResources 로 앱 번들 Resources/asis-qrgen.
 *   - dev : 프로젝트 resources/bin/asis-qrgen (pnpm build:qrgen 산출물).
 */
function qrgenBinaryPath(): string {
  const prod = join(process.resourcesPath, 'asis-qrgen');
  if (existsSync(prod)) return prod;
  return join(app.getAppPath(), 'resources', 'bin', 'asis-qrgen');
}

/**
 * asis-qrgen 헬퍼를 spawn 해 payload 를 QR PNG 로 저장하고 그 경로를 반환한다.
 *
 * ocr.ts 의 runVision 패턴을 따른다: 바이너리 부재/비정상 종료는 조용히 넘기지
 * 않고 명시적으로 reject 한다(null-safety). 헬퍼는 결과를 stdout 이 아니라 파일로
 * 쓰므로 stdout 은 모으지 않고 stderr 만 진단용으로 수집한다.
 *
 * 반환한 PNG 는 임시 파일이다 — 호출측이 dataURL 변환 후 unlink 로 정리한다
 * (index.ts 의 QR·바코드 스캔 cleanup 흐름과 동일).
 */
export function generateQrPng(payload: string): Promise<string> {
  const bin = qrgenBinaryPath();
  if (!existsSync(bin)) {
    return Promise.reject(
      new Error(
        `QR 생성 바이너리를 찾을 수 없습니다: ${bin} — 'pnpm build:qrgen' 를 실행하세요`,
      ),
    );
  }
  // 빈 payload 는 헬퍼도 exit 2 로 거절하지만, 호출측 안내(notifyInfo)를 위해
  // 여기서 먼저 명시적으로 걸러 원인을 드러낸다.
  if (payload.length === 0) {
    return Promise.reject(new Error('QR 로 만들 텍스트가 비어 있습니다'));
  }

  const outPath = join(
    tmpdir(),
    `asis-qrgen-${Date.now()}-${process.pid}.png`,
  );

  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, [payload, outPath]);
    const errChunks: Buffer[] = [];
    let settled = false;

    child.stderr.on('data', (c: Buffer) => errChunks.push(c));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`QR 생성 spawn 실패: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve(outPath);
        return;
      }
      const stderr = Buffer.concat(errChunks).toString('utf8').trim();
      reject(new Error(`QR 생성 실패 (exit ${code ?? 'null'}): ${stderr}`));
    });
  });
}
