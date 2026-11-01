import { open } from 'node:fs/promises';
import ffmpegPath from 'ffmpeg-static';
import { runProcess } from '../runProcess';

/**
 * 디스플레이별 캡처 PNG 들을 실제 배치(Electron `screen` 좌표)대로 한 장에 합성.
 *
 * 합성 규칙
 *   - 출력 배율 = 디스플레이 scaleFactor 중 최댓값. Retina + 일반 모니터 혼합이면
 *     일반 모니터 쪽을 업스케일한다 (Retina 디테일을 버리지 않기 위해).
 *   - 캔버스 = 모든 bounds 합집합. L자 배치 등으로 빈 공간은 *검정* —
 *     투명은 붙여넣는 앱마다 흰/검정으로 달리 보여서 결과가 예측 불가하다.
 *
 * 룰
 *   - imperative-style.md — 모듈 함수 + 명령형 OK (lifecycle 없음).
 *   - null-safety.md — ffmpeg path null / 빈 입력 / exit code 비-0 은 throw.
 */

if (!ffmpegPath) {
  throw new Error('ffmpeg-static path 가 null — 설치 안 됐거나 platform 미지원');
}

// gif.ts 와 동일 — asar 안의 바이너리는 spawn 불가라 asarUnpack 경로로 교정.
const FFMPEG_BIN = ffmpegPath.replace('app.asar', 'app.asar.unpacked');

export type DisplayShot = {
  /** 해당 디스플레이만 캡처한 PNG path. */
  path: string;
  /** Electron Display.bounds (포인트, 주 모니터 top-left 원점, 음수 가능). */
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
};

export async function stitchDisplays(shots: DisplayShot[], outputPath: string): Promise<void> {
  if (shots.length === 0) {
    throw new Error('stitchDisplays: shots 가 비어 있음');
  }
  // 캡처 도중 디스플레이 분리·배치 변경이면 -R 이 잘린 이미지를 돌려준다.
  // 아래 scale 이 그걸 bounds 크기로 늘려 찌그러진 결과를 *조용히* 내지 않도록 먼저 검사.
  const sizes = await Promise.all(shots.map((s) => readPngSize(s.path)));
  for (const [i, shot] of shots.entries()) {
    const actual = sizes[i];
    const expectedW = Math.round(shot.bounds.width * shot.scaleFactor);
    const expectedH = Math.round(shot.bounds.height * shot.scaleFactor);
    if (Math.abs(actual.width - expectedW) > 1 || Math.abs(actual.height - expectedH) > 1) {
      throw new Error(
        `stitchDisplays: ${shot.path} 크기 ${actual.width}x${actual.height} ≠ 기대 ${expectedW}x${expectedH} (캡처 중 디스플레이 구성 변경 추정)`,
      );
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let scale = 0;
  for (const { bounds: b, scaleFactor } of shots) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
    scale = Math.max(scale, scaleFactor);
  }
  const px = (pt: number): number => Math.round(pt * scale);
  const canvasW = px(maxX - minX);
  const canvasH = px(maxY - minY);

  // [0] = 검정 캔버스, [1..N] = 디스플레이 PNG. 각 PNG 를 목표 크기로 맞춘 뒤
  // 순서대로 overlay. 전 구간 RGB 로 유지해 yuv 크로마 서브샘플링 번짐을 막는다.
  const inputs: string[] = ['-f', 'lavfi', '-i', `color=c=black:s=${canvasW}x${canvasH}:r=1`];
  const filters: string[] = ['[0:v]format=rgb24[c0]'];
  shots.forEach((shot, i) => {
    const n = i + 1;
    const b = shot.bounds;
    inputs.push('-i', shot.path);
    filters.push(
      `[${n}:v]scale=${px(b.width)}:${px(b.height)}:flags=lanczos,format=rgb24[s${n}]`,
      `[c${i}][s${n}]overlay=${px(b.x - minX)}:${px(b.y - minY)}:format=rgb[c${n}]`,
    );
  });

  const args = [
    '-v', 'error',
    '-y',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', `[c${shots.length}]`,
    '-frames:v', '1',
    '-update', '1',
    '-pix_fmt', 'rgb24',
    outputPath,
  ];
  const { code, stderr } = await runProcess(FFMPEG_BIN, args, 'ffmpeg');
  if (code !== 0) {
    throw new Error(`ffmpeg 디스플레이 합성 실패 (exit ${code ?? 'null'}): ${stderr}`);
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG 헤더만 읽어 픽셀 크기 반환. 시그니처(8) + IHDR length/type(8) 뒤 width·height(BE uint32). */
async function readPngSize(path: string): Promise<{ width: number; height: number }> {
  const fh = await open(path, 'r');
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await fh.read(header, 0, 24, 0);
    if (bytesRead < 24 || !header.subarray(0, 8).equals(PNG_SIGNATURE) || header.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error(`stitchDisplays: PNG 헤더가 아님 — ${path}`);
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } finally {
    await fh.close();
  }
}
