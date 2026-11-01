import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { FfmpegJob } from './ffmpeg';
import { UserFacingError } from '../userFacingError';
import { tGifStudio } from './strings';
import type { GifStudioMedia } from './types';

/** 파일 선택 다이얼로그 필터와 공유하는 지원 확장자 (점 없이). */
export const GIF_EXTENSIONS = ['gif'];
export const VIDEO_EXTENSIONS = ['mov', 'mp4', 'm4v', 'webm', 'avi', 'mkv'];

/** 확장자로 종류를 정한다. 지원하지 않으면 throw. */
export function mediaKindOf(filePath: string): 'gif' | 'video' {
  const ext = extname(filePath).slice(1).toLowerCase();
  if (GIF_EXTENSIONS.includes(ext)) return 'gif';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  // 사용자에게 알림으로 그대로 보이는 메시지라 현재 언어로 만든다.
  throw new UserFacingError(tGifStudio().unsupportedFormat(ext || '—'), filePath);
}

/**
 * ffmpeg 배너(`ffmpeg -i <file>`)를 파싱해 길이·크기를 읽는다.
 * ffmpeg-static 에는 ffprobe 가 없어서 배너 파싱이 유일한 수단이다.
 * 출력 파일이 없으니 exit code 는 항상 1 — 코드가 아니라 파싱 성공 여부로 판정한다.
 */
export async function probeMedia(
  filePath: string,
  deleteOnClose: boolean,
): Promise<GifStudioMedia> {
  const kind = mediaKindOf(filePath);
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new UserFacingError(tGifStudio().notAFile(basename(filePath)), filePath);
  }
  const { stderr } = await new FfmpegJob().run(['-hide_banner', '-i', filePath]);
  let banner: ReturnType<typeof parseBanner>;
  try {
    banner = parseBanner(stderr);
  } catch (err) {
    // 배너 파싱 실패 = 손상 파일·스트림 없음 — 원인(배너 끝부분)은 로그용 detail.
    const detail = err instanceof Error ? err.message : String(err);
    throw new UserFacingError(tGifStudio().unreadableMedia(basename(filePath)), detail);
  }
  const { duration, width, height, fps } = banner;
  return {
    kind,
    path: filePath,
    name: basename(filePath),
    size: info.size,
    width,
    height,
    duration,
    fps,
    deleteOnClose,
  };
}

/** 배너 파싱 — 단위 테스트하기 쉽게 순수 함수로 분리. */
export function parseBanner(stderr: string): {
  duration: number;
  width: number;
  height: number;
  fps: number | null;
} {
  const durationMatch = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(stderr);
  const videoLine = stderr.split('\n').find((line) => line.includes('Video:'));
  // "320x200 [SAR" / "1920x1080," — 코덱 태그(0x68347061)와 구분하려고 앞뒤 경계를 본다.
  const sizeMatch = videoLine ? /\s(\d{2,5})x(\d{2,5})(?=[\s,[]|$)/.exec(videoLine) : null;
  if (!durationMatch || !sizeMatch) {
    throw new Error(`미디어 길이·해상도를 읽지 못했다: ${stderr.split('\n').slice(-3).join(' ')}`);
  }
  const duration =
    Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]);
  let width = Number(sizeMatch[1]);
  let height = Number(sizeMatch[2]);
  // 세로 촬영 영상 — ffmpeg 는 기본 autorotate 로 회전된 프레임을 내보내므로 크기도 맞춘다.
  const rotation = /rotation of\s+(-?[\d.]+)\s+degrees/i.exec(stderr);
  if (rotation && Math.abs(Math.round(Number(rotation[1]) / 90)) % 2 === 1) {
    [width, height] = [height, width];
  }
  if (!(duration > 0) || !(width > 0) || !(height > 0)) {
    throw new Error(`유효하지 않은 미디어 정보: ${duration}s ${width}x${height}`);
  }
  // "10 fps," / "29.97 fps," — 없으면(일부 VFR 컨테이너) null.
  const fpsMatch = videoLine ? /\s(\d+(?:\.\d+)?) fps/.exec(videoLine) : null;
  const fps = fpsMatch ? Number(fpsMatch[1]) : null;
  return { duration, width, height, fps };
}
