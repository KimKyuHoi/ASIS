import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UserFacingError } from '../userFacingError';
import { tGifStudio } from './strings';
import type { GifExportOptions, GifOverlaySegment, GifOverlayTrack } from './types';

/**
 * 프레임별 주석 트랙 → ffmpeg concat 입력.
 *
 * 보이는 주석 조합이 바뀌는 구간마다 PNG 한 장을 ffconcat 목록으로 이어
 * overlay 입력을 *하나* 로 만든다. 실측(1280×720·10초·15fps, 40구간):
 *   - 구간마다 overlay 입력을 따로 붙이면 1.81s / RSS 1160MB
 *   - concat 한 줄이면 1.66s / RSS 715MB (주석 없음 632MB)
 * 구간 수가 늘어도 메모리가 거의 늘지 않아 이 방식을 쓴다.
 */

/** 부동소수 오차 허용 — 렌더러가 프레임 경계로 맞춘 초 값을 그대로 쓴다. */
const EPS = 1e-4;

/** 잘못된 트랙은 렌더러 버그 — 조용히 보정하지 않고 throw. */
function validateOverlayTrack(track: GifOverlayTrack, o: GifExportOptions): void {
  const { images, segments } = track;
  const first = segments.at(0);
  const last = segments.at(-1);
  const problem = ((): string | null => {
    if (images.length === 0 || !first || !last) return '빈 트랙';
    if (Math.abs(first.start - o.start) > EPS || Math.abs(last.end - o.end) > EPS) {
      return `트랙이 구간을 덮지 않음: ${first.start}~${last.end} vs ${o.start}~${o.end}`;
    }
    for (let i = 0; i < segments.length; i++) {
      const found = segmentProblem(segments[i], i > 0 ? segments[i - 1] : undefined, images.length);
      if (found !== null) return found;
    }
    return null;
  })();
  if (problem !== null) {
    throw new UserFacingError(tGifStudio().invalidOptions, `overlay track: ${problem}`);
  }
}

/** prev 는 바로 앞 구간 (첫 구간이면 undefined) — 겹치거나 끊기면 문제. */
function segmentProblem(
  seg: GifOverlaySegment,
  prev: GifOverlaySegment | undefined,
  imageCount: number,
): string | null {
  if (!Number.isInteger(seg.image) || seg.image < 0 || seg.image >= imageCount) {
    return `잘못된 이미지 번호 ${seg.image}`;
  }
  if (!(seg.end > seg.start)) return `빈 구간 ${seg.start}~${seg.end}`;
  if (prev && Math.abs(prev.end - seg.start) > EPS) {
    return `끊긴 구간 @${seg.start}`;
  }
  return null;
}

/**
 * ffconcat 본문 — 원본 시간을 출력 시간((t - start) / speed)으로 바꿔 duration 을 적는다.
 * concat demuxer 는 마지막 항목의 duration 을 무시하므로 마지막 파일을 한 번 더 적는다.
 */
function buildOverlayConcat(
  track: GifOverlayTrack,
  o: GifExportOptions,
  imagePaths: string[],
): string {
  const quote = (p: string): string => `'${p.replace(/'/g, "'\\''")}'`;
  const lines = ['ffconcat version 1.0'];
  for (const seg of track.segments) {
    lines.push(`file ${quote(imagePaths[seg.image])}`);
    lines.push(`duration ${((seg.end - seg.start) / o.speed).toFixed(6)}`);
  }
  const last = track.segments[track.segments.length - 1];
  lines.push(`file ${quote(imagePaths[last.image])}`);
  return `${lines.join('\n')}\n`;
}

/** 한 번에 디스크에 쓰는 PNG 수 — 수백 장을 Promise.all 로 동시에 열면 메모리·파일 핸들이 튄다. */
const WRITE_CONCURRENCY = 8;

function decodePng(dataUrl: string, i: number): Buffer {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  if (base64 === dataUrl) {
    throw new UserFacingError(tGifStudio().invalidOptions, `overlay ${i} 가 PNG data URL 이 아님`);
  }
  return Buffer.from(base64, 'base64');
}

/** 이미지들을 WRITE_CONCURRENCY 장씩 나눠 순서대로 쓴다. */
async function writeImages(images: string[], dir: string, from = 0): Promise<string[]> {
  const batch = images.slice(from, from + WRITE_CONCURRENCY);
  if (batch.length === 0) return [];
  const paths = await Promise.all(batch.map(async (dataUrl, j) => {
    const i = from + j;
    const path = join(dir, `overlay-${i}.png`);
    await writeFile(path, decodePng(dataUrl, i));
    return path;
  }));
  return [...paths, ...await writeImages(images, dir, from + WRITE_CONCURRENCY)];
}

/**
 * 이미지·목록을 dir 에 쓰고 concat 목록 경로를 돌려준다.
 * dir 은 내보내기 한 번 전용 폴더 — 호출자가 끝나면 폴더째 지운다.
 */
export async function writeOverlayTrack(
  track: GifOverlayTrack,
  o: GifExportOptions,
  dir: string,
): Promise<string> {
  validateOverlayTrack(track, o);
  const imagePaths = await writeImages(track.images, dir);
  const listPath = join(dir, 'overlay.ffconcat');
  await writeFile(listPath, buildOverlayConcat(track, o, imagePaths));
  return listPath;
}
