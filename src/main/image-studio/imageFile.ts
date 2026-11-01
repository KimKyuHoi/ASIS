import { nativeImage } from 'electron';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { runProcess } from '../runProcess';
import { tMain } from '../i18n/strings';
import { UserFacingError } from '../userFacingError';
import { readJpegOrientation, swapsAxes } from './jpegOrientation';

/**
 * 이미지 스튜디오 — 기존 이미지 파일을 에디터 배경으로 읽는다. 원본 파일은 읽기만 한다
 * (저장은 에디터의 기존 저장 경로: 대화상자·저장 폴더).
 *
 * 형식
 *  - PNG·JPEG: nativeImage 가 직접 읽는다 → 원본 바이트를 그대로 data URL 로 (재인코딩 없음).
 *  - HEIC·TIFF·BMP·WebP: nativeImage.createFromPath 가 빈 이미지를 준다(Electron 39 실측).
 *    macOS 기본 도구 sips 로 임시 PNG 로 바꿔 읽는다.
 *  - GIF 는 여기 오지 않는다 — Finder/트레이에서 GIF 스튜디오로 간다.
 */

/** 이미지 스튜디오가 여는 확장자 (점 없이, 소문자). 열기 대화상자 필터·open-file 분기가 같이 쓴다. */
export const IMAGE_STUDIO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'heic', 'heif', 'tiff', 'tif', 'bmp', 'webp'];

const DIRECT_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);
const SIPS_BIN = '/usr/bin/sips';

/**
 * 파일 크기·픽셀 상한. 에디터는 원본 픽셀 크기의 캔버스로 export 하므로 Chromium 캔버스 한도
 * (한 변 32767px, 면적 약 2.7억 px) 안쪽이어야 한다. 여유를 두고 한 변 16384px · 1억 px.
 */
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_SIDE_PX = 16384;
const MAX_AREA_PX = 100_000_000;

export function isImageStudioFile(path: string): boolean {
  return IMAGE_STUDIO_EXTENSIONS.includes(extname(path).slice(1).toLowerCase());
}

export type ImageFile = {
  dataUrl: string;
  /** 물리 픽셀 */
  width: number;
  height: number;
};

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** sips 로 임시 PNG 를 만들어 읽고 임시 폴더는 지운다. */
async function convertWithSips(path: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'asis-image-'));
  const out = join(dir, 'converted.png');
  try {
    const { code, stderr } = await runProcess(SIPS_BIN, ['-s', 'format', 'png', path, '--out', out], 'sips');
    if (code !== 0) throw new Error(`sips exit ${String(code)}: ${stderr}`);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 파일 크기 상한을 먼저 본다 — 거대한 파일을 메모리에 올리기 전에 거절. */
async function checkFileSize(path: string): Promise<void> {
  const t = tMain().imageStudio;
  let size: number;
  try {
    ({ size } = await stat(path));
  } catch (err) {
    throw new UserFacingError(t.readFailed, errorText(err));
  }
  if (size > MAX_FILE_BYTES) {
    throw new UserFacingError(t.tooLarge, `${path}: ${String(size)} bytes`);
  }
}

/** 원본 바이트(PNG·JPEG) 또는 sips 로 바꾼 PNG 바이트. */
async function readImageBytes(path: string, direct: boolean): Promise<Buffer> {
  const t = tMain().imageStudio;
  try {
    return direct ? await readFile(path) : await convertWithSips(path);
  } catch (err) {
    throw new UserFacingError(direct ? t.readFailed : t.unsupported, errorText(err));
  }
}

/**
 * 화면(Chromium)이 보는 픽셀 크기. JPEG 는 원본 바이트를 그대로 renderer 에 넘기고 Chromium 이
 * EXIF 회전을 적용해 그린다 — 90° 계열이면 가로·세로를 바꾼다(jpegOrientation.ts).
 * PNG·sips 변환본은 회전 태그가 없다.
 */
function displaySize(image: Electron.NativeImage, bytes: Buffer, isJpeg: boolean): {
  width: number;
  height: number;
} {
  const raw = image.getSize();
  const rotated = isJpeg && swapsAxes(readJpegOrientation(bytes));
  return rotated ? { width: raw.height, height: raw.width } : raw;
}

/**
 * 이미지 파일 → 에디터 배경. 실패는 사전 문구의 UserFacingError
 * (원인 원문은 detail — 호출측이 로그에 남긴다).
 */
export async function loadImageFile(path: string): Promise<ImageFile> {
  const t = tMain().imageStudio;
  await checkFileSize(path);
  const ext = extname(path).slice(1).toLowerCase();
  const direct = DIRECT_EXTENSIONS.has(ext);
  const isJpeg = direct && ext !== 'png';
  const bytes = await readImageBytes(path, direct);
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) throw new UserFacingError(t.unsupported, `${path}: 디코드 실패`);
  const { width, height } = displaySize(image, bytes, isJpeg);
  if (width > MAX_SIDE_PX || height > MAX_SIDE_PX || width * height > MAX_AREA_PX) {
    throw new UserFacingError(t.tooLarge, `${path}: ${String(width)}×${String(height)}`);
  }
  const mime = isJpeg ? 'image/jpeg' : 'image/png';
  return { dataUrl: `data:${mime};base64,${bytes.toString('base64')}`, width, height };
}
