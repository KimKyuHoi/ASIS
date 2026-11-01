import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FfmpegJob } from './ffmpeg';
import type { GifStudioMedia, GifStudioPreview } from './types';

/** 필름스트립 썸네일 개수와 높이 — 트림 바 높이(56px)의 Retina 2배. */
const FILMSTRIP_FRAMES = 12;
const FILMSTRIP_HEIGHT = 112;
/** 미리보기 프록시 최대 너비 — 원본 대신 재생만 하므로 작게 둔다. */
const PROXY_MAX_WIDTH = 1280;

/**
 * 재생·트림 UI 용 자원을 dir 안에 만든다.
 *
 *  - proxy.mp4  : 모든 입력(GIF·ProRes·HEVC …)을 H.264 로 통일 — Chromium <video> 가
 *                 GIF 는 seek 을 못 하고 일부 MOV 는 아예 디코딩하지 못하기 때문.
 *                 시간축은 원본 그대로라 트림 초 단위가 원본과 1:1 로 맞는다.
 *  - strip.png  : tile 필터로 N 장을 가로로 붙인 필름스트립 한 장.
 *
 * 렌더러에는 file:// 대신 바이트를 넘긴다 — dev(http 페이지)에서는 file:// 로드가
 * 막히고(editor ipc-init 주석 참고), 바이트 → Blob URL 은 dev/prod 동일하게 동작한다.
 */
export async function buildPreview(
  job: () => FfmpegJob,
  media: GifStudioMedia,
  dir: string,
): Promise<GifStudioPreview> {
  const proxyPath = join(dir, 'proxy.mp4');
  const stripPath = join(dir, 'strip.png');

  await job().runOrThrow([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', media.path,
    '-map', '0:v:0',
    // libx264 는 짝수 크기만 받는다 — 너비·높이 모두 짝수로 맞춘다.
    '-vf', `scale='trunc(min(${PROXY_MAX_WIDTH},iw)/2)*2':-2:flags=bicubic,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
    '-an', '-movflags', '+faststart',
    proxyPath,
  ], 'preview');

  await job().runOrThrow([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', media.path,
    '-vf',
    `fps=${FILMSTRIP_FRAMES}/${media.duration.toFixed(3)},` +
    `scale=-2:${FILMSTRIP_HEIGHT},tile=${FILMSTRIP_FRAMES}x1`,
    '-frames:v', '1',
    stripPath,
  ], 'filmstrip');

  const [video, filmstrip] = await Promise.all([readFile(proxyPath), readFile(stripPath)]);
  return {
    video: new Uint8Array(video),
    filmstrip: new Uint8Array(filmstrip),
    filmstripFrames: FILMSTRIP_FRAMES,
  };
}
