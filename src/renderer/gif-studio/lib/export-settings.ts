import type { GifExportOptions, GifStudioMedia } from '../../../main/gif-studio/types';

/** main/gif-studio/gifExport.ts 의 검증 범위와 맞춘다. */
const SIZE_MIN = 16;
const SIZE_MAX = 4096;
export const FPS_MIN = 1;
export const FPS_MAX = 50;
export const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
/** Dimensions 드롭다운 — 원본 대비 배율. */
export const DIMENSION_SCALES = [1, 0.75, 0.5, 0.33, 0.25] as const;
/** 트림 최소 길이 (초) — 핸들이 겹쳐 0 길이가 되지 않게. */
export const MIN_TRIM = 0.1;

export type ExportSettings = {
  width: number;
  height: number;
  fps: number;
  quality: number;
  speed: number;
};

const DEFAULT_VIDEO_FPS = 10;

/** 원본 크기를 SIZE_MAX 안으로 맞춘 기본 출력 크기. */
function fitOriginal(media: GifStudioMedia): { width: number; height: number } {
  const scale = Math.min(1, SIZE_MAX / Math.max(media.width, media.height));
  return scaledSize(media, scale);
}

export function scaledSize(
  media: GifStudioMedia,
  scale: number,
): { width: number; height: number } {
  return {
    width: clampSize(Math.round(media.width * scale)),
    height: clampSize(Math.round(media.height * scale)),
  };
}

export function clampSize(value: number): number {
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(value)));
}

export function defaultSettings(media: GifStudioMedia): ExportSettings {
  // GIF 는 원본 프레임 간격을 지키고(녹화 GIF 그대로), 영상은 GIF 용으로 낮춘다.
  // fps 를 모르면(null) 영상 기본값 — 배너에 없을 뿐 오류는 아니다.
  const sourceFps = media.fps === null ? DEFAULT_VIDEO_FPS : Math.round(media.fps);
  const fps = media.kind === 'gif'
    ? Math.min(FPS_MAX, Math.max(FPS_MIN, sourceFps))
    : Math.min(DEFAULT_VIDEO_FPS, Math.max(FPS_MIN, sourceFps));
  return {
    ...fitOriginal(media),
    fps,
    quality: 80,
    speed: 1,
  };
}

/** 내보낸 GIF 의 재생 길이 (초). */
export function outputDuration(start: number, end: number, s: ExportSettings): number {
  return (end - start) / s.speed;
}

/**
 * 예상 파일 크기 — 실측(ffmpeg testsrc, 품질 50~100)에서 프레임·픽셀당 0.065~0.09 B 를
 * 근거로 한 대략값. 화면 녹화처럼 변화가 적으면 훨씬 작아진다 → UI 에 "약" 으로 표시.
 */
export function estimateBytes(start: number, end: number, s: ExportSettings): number {
  const frames = Math.max(1, Math.ceil(outputDuration(start, end, s) * s.fps));
  const bytesPerPixel = 0.04 + 0.05 * (s.quality / 100);
  return Math.round(frames * s.width * s.height * bytesPerPixel);
}

export function toExportOptions(start: number, end: number, s: ExportSettings): GifExportOptions {
  return {
    start,
    end,
    width: s.width,
    height: s.height,
    fps: s.fps,
    quality: s.quality,
    speed: s.speed,
  };
}
