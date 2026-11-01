import { UserFacingError } from '../userFacingError';
import type { FfmpegJob } from './ffmpeg';
import { tGifStudio } from './strings';
import type { GifExportOptions, GifStudioMedia } from './types';

/**
 * GIF 스튜디오 내보내기 — 트림·속도·FPS·리사이즈·주석 오버레이·바운스를 한 번의
 * ffmpeg filter_complex 로 처리하고, palettegen → paletteuse 2-pass 로 GIF 를 만든다.
 *
 * capture/gif.ts 의 encodeGif 와 같은 palette 2-pass 이지만, 그쪽은 PNG 프레임
 * 폴더 입력 전용이고 색 수 조절이 없어 split 으로 한 프로세스 안에서 두 pass 를 돈다
 * (중간 PNG 프레임을 디스크에 풀지 않아 긴 영상도 tmp 를 덜 쓴다).
 */

const SPEED_MIN = 0.25;
const SPEED_MAX = 4;
const FPS_MIN = 1;
const FPS_MAX = 50;
const SIZE_MIN = 16;
const SIZE_MAX = 4096;

/** 범위 검사 표 — [이름, 값, 최소, 최대, 정수 여부]. */
type RangeRule = [string, number, number, number, boolean];

/** 잘못된 값은 조용히 보정하지 않고 throw — renderer 버그를 숨기지 않는다. */
function validateExportOptions(o: GifExportOptions, media: GifStudioMedia): void {
  const numbers = [o.start, o.end, o.width, o.height, o.fps, o.quality, o.speed, o.plays];
  if (numbers.some((v) => !Number.isFinite(v))) {
    throw invalid(`GIF 내보내기 옵션에 숫자가 아닌 값: ${JSON.stringify(o)}`);
  }
  if (o.start < 0 || o.end <= o.start || o.end > media.duration + 0.05) {
    throw invalid(`GIF 내보내기 구간이 잘못됐다: ${o.start}~${o.end} (길이 ${media.duration})`);
  }
  const rules: RangeRule[] = [
    ['width', o.width, SIZE_MIN, SIZE_MAX, true],
    ['height', o.height, SIZE_MIN, SIZE_MAX, true],
    ['fps', o.fps, FPS_MIN, FPS_MAX, true],
    ['quality', o.quality, 1, 100, false],
    ['speed', o.speed, SPEED_MIN, SPEED_MAX, false],
    // plays 0 = 무한 반복.
    ['plays', o.plays, 0, 1000, true],
  ];
  for (const [name, value, min, max, integer] of rules) {
    if (value < min || value > max || (integer && !Number.isInteger(value))) {
      throw invalid(`GIF 내보내기 ${name} 은 ${min}~${max}${integer ? ' 정수' : ''}: ${value}`);
    }
  }
}

/** 설정 값 오류 — 사용자에겐 일반 안내, 어떤 값이 틀렸는지는 로그용 detail. */
function invalid(detail: string): UserFacingError {
  return new UserFacingError(tGifStudio().invalidOptions, detail);
}

/** 품질(1~100) → palettegen max_colors(32~256). */
function qualityToColors(quality: number): number {
  return Math.round(32 + (quality / 100) * 224);
}

/**
 * 총 재생 횟수 → ffmpeg gif muxer -loop 값.
 * -loop 0 = 무한, -1 = 반복 없음(1회), n = 첫 재생 뒤 n 번 더.
 */
function playsToLoopArg(plays: number): number {
  if (plays === 0) return 0;
  if (plays === 1) return -1;
  return plays - 1;
}

export type ExportSpec = {
  media: GifStudioMedia;
  options: GifExportOptions;
  /** 프레임별 주석 PNG 들의 ffconcat 목록 (overlayTrack.ts). 주석이 없으면 null. */
  overlayPath: string | null;
  outputPath: string;
};

/** ffmpeg 인자 — 순수 함수라 실제 실행 없이 검증할 수 있다. */
function buildExportArgs({ media, options, overlayPath, outputPath }: ExportSpec): string[] {
  const { start, end, width, height, fps, speed, bounce } = options;
  const duration = end - start;
  const input: string[] = [];
  const chain: string[] = [];

  if (media.kind === 'video') {
    // 영상은 입력 앞 -ss 로 키프레임 seek → 디코딩 정확 seek (재인코딩이라 프레임 정확).
    input.push('-ss', start.toFixed(3), '-t', duration.toFixed(3), '-i', media.path);
  } else {
    // GIF demuxer 의 입력 seek 은 신뢰하기 어려워 trim 필터로 자른다.
    input.push('-i', media.path);
    chain.push(`trim=start=${start.toFixed(3)}:end=${end.toFixed(3)}`);
  }
  chain.push(
    `setpts=(PTS-STARTPTS)/${speed}`,
    `fps=${fps}`,
    `scale=${width}:${height}:flags=lanczos`,
  );

  const graph: string[] = [`[0:v]${chain.join(',')}[base]`];
  let last = 'base';

  if (overlayPath) {
    // 구간별 주석 PNG 를 이은 concat 입력 하나 — 출력 시간축(0 부터)과 같은 타임라인이다.
    // 마지막 PNG 는 eof_action=repeat 로 끝까지 유지 (부동소수 끝자락 1프레임 대비).
    input.push('-f', 'concat', '-safe', '0', '-i', overlayPath);
    graph.push(`[1:v]fps=${fps},scale=${width}:${height}:flags=lanczos,format=rgba[ann]`);
    graph.push(`[${last}][ann]overlay=0:0:format=auto:eof_action=repeat[comp]`);
    last = 'comp';
  }

  if (bounce) {
    graph.push(`[${last}]split[fwd][rev0]`);
    graph.push('[rev0]reverse[rev]');
    graph.push('[fwd][rev]concat=n=2:v=1:a=0[bounced]');
    last = 'bounced';
  }

  graph.push(`[${last}]split[pa][pb]`);
  graph.push(`[pa]palettegen=max_colors=${qualityToColors(options.quality)}:stats_mode=diff[pal]`);
  graph.push('[pb][pal]paletteuse=dither=sierra2_4a:diff_mode=rectangle');

  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...input,
    '-filter_complex',
    graph.join(';'),
    '-an',
    '-loop',
    String(playsToLoopArg(options.plays)),
    outputPath,
  ];
}

export async function exportGif(job: FfmpegJob, spec: ExportSpec): Promise<void> {
  validateExportOptions(spec.options, spec.media);
  await job.runOrThrow(buildExportArgs(spec), 'export');
}
