import { screen } from 'electron';
import ffmpegPath from 'ffmpeg-static';
import { runProcess } from '../runProcess';
import { tMain } from '../i18n/strings';
import { UserFacingError } from '../userFacingError';
import type { Rect } from './screenRecord';

/**
 * ffmpeg avfoundation 화면 입력 해석 — 디스플레이 매칭, 물리 crop, 장치 인덱스 캐시.
 * screenRecord.ts 의 ffmpeg 엔진이 쓴다 (screencapture 엔진은 clampToDisplay 만 쓴다).
 */

if (!ffmpegPath) {
  throw new Error('ffmpeg-static path 가 null — 설치 안 됐거나 platform 미지원');
}
// electron-builder 가 app.asar 안 바이너리를 spawn 할 수 없어 unpacked 경로로 교정 (gif.ts 와 동일).
export const FFMPEG_BIN = ffmpegPath.replace('app.asar', 'app.asar.unpacked');

function floorEven(n: number): number {
  return Math.floor(n / 2) * 2;
}

/**
 * rect 가 속한 디스플레이와, 그 디스플레이 경계로 자른 영역(전역 논리 좌표).
 * 화면 밖으로 일부 나간 영역(예: 반쯤 밖에 걸친 창 스냅)은 경계로 자른다 —
 * crop 이 프레임을 넘으면 ffmpeg 가 시작 직후 종료한다.
 */
export function clampToDisplay(rect: Rect): {
  display: Electron.Display;
  area: { left: number; top: number; right: number; bottom: number };
} {
  const display = screen.getDisplayMatching({
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
  });
  const b = display.bounds;
  const left = Math.max(rect.x, b.x);
  const top = Math.max(rect.y, b.y);
  const right = Math.min(rect.x + rect.w, b.x + b.width);
  const bottom = Math.min(rect.y + rect.h, b.y + b.height);
  if (right - left < 1 || bottom - top < 1) {
    throw new UserFacingError(
      tMain().video.errors.noDisplay,
      `rect 가 디스플레이와 겹치지 않음 (${String(rect.x)},${String(rect.y)} ${String(rect.w)}x${String(rect.h)})`,
    );
  }
  return { display, area: { left, top, right, bottom } };
}

/** rect 가 속한 디스플레이 → avfoundation 입력 인덱스 + 물리 crop 좌표. */
export async function resolveAvfInput(
  rect: Rect,
): Promise<{ input: number; crop: Rect }> {
  const { display, area } = clampToDisplay(rect);
  const { left, top, right, bottom } = area;
  const displays = screen.getAllDisplays();
  const displayIdx = displays.findIndex((d) => d.id === display.id);
  if (displayIdx < 0) {
    throw new UserFacingError(
      tMain().video.errors.noDisplay,
      'rect 에 매칭되는 디스플레이를 찾지 못함',
    );
  }
  const screenIndices = await avfoundationScreenIndices();
  const hasAvfInput = displayIdx < screenIndices.length;
  if (!hasAvfInput) {
    throw new UserFacingError(
      tMain().video.errors.noScreenInput,
      `avfoundation 화면 입력 매핑 실패 (display ${displayIdx}/${displays.length}, screens ${screenIndices.length})`,
    );
  }
  // Electron Display.scaleFactor 는 항상 양수다(1·2 등) — 폴백 없이 쓴다.
  const sf = display.scaleFactor;
  const b = display.bounds;
  // libx264 yuv420p 는 crop 폭·높이가 짝수여야 한다. offset 도 chroma 안전을 위해 짝수화.
  const crop: Rect = {
    w: Math.max(2, floorEven(Math.round((right - left) * sf))),
    h: Math.max(2, floorEven(Math.round((bottom - top) * sf))),
    x: floorEven((left - b.x) * sf),
    y: floorEven((top - b.y) * sf),
  };
  return { input: screenIndices[displayIdx], crop };
}

/**
 * avfoundation 인덱스 캐시 — `-list_devices` spawn 은 장치 열거로 수백 ms 걸려서
 * 매 녹화 시작마다 하면 "선택 완료 → 녹화 시작" 사이 지연이 된다.
 * 디스플레이 구성(id 목록)이 바뀌면 stale 이므로 signature 로 무효화한다.
 * (카메라 추가/제거로도 인덱스가 밀릴 수 있지만 디스플레이 signature 만 추적 —
 * 녹화 도중이 아닌 캡처 사이에 카메라가 바뀌는 케이스는 드물고, 그때는
 * 디스플레이도 함께 재열거하는 warm 경로가 대부분 다시 탄다.)
 */
let avfIndicesCache: { signature: string; indices: number[] } | null = null;

function displaySignature(): string {
  return screen.getAllDisplays().map((d) => d.id).join(',');
}

/**
 * 영역 선택이 뜨는 동안 미리 호출해 두는 warm-up — 사용자가 영역을 고르는
 * 수 초 사이에 장치 열거가 끝나므로 녹화 시작 시 spawn 을 생략할 수 있다.
 * 실패는 무시 — start() 경로의 avfoundationScreenIndices() 가 다시 시도한다.
 */
export function warmAvfoundationIndices(): void {
  avfoundationScreenIndices().catch(() => {
    // 여기서 로그까지 남기면 start() 실패와 이중 보고 — start() 쪽이 사용자에게 표면화한다.
  });
}

/**
 * avfoundation "Capture screen N" 항목의 ffmpeg 입력 인덱스를 screen 번호 순서대로 반환.
 *
 * 카메라 수가 환경마다 달라(내장/iPhone/외장 등) screen 시작 인덱스가 가변이므로
 * `-list_devices` 를 파싱한다. electron getAllDisplays() 순서 = CGDisplay(screen N)
 * 순서로 가정하고 인덱스를 매칭한다.
 *
 * list_devices 는 입력이 없어 exit code 가 0 이 아니지만 목록은 stderr 로 나온다
 * (runProcess 는 code 를 판정하지 않고 stderr 를 그대로 준다).
 */
async function avfoundationScreenIndices(): Promise<number[]> {
  const signature = displaySignature();
  if (avfIndicesCache?.signature === signature) {
    return avfIndicesCache.indices;
  }
  const { stderr } = await runProcess(FFMPEG_BIN, [
    '-f',
    'avfoundation',
    '-list_devices',
    'true',
    '-i',
    '',
  ]);
  const result = parseScreenInputIndices(stderr);
  // 파싱 결과가 비면 캐시하지 않는다 — 일시적 실패(권한 프롬프트 등)를 고착시키지 않기 위해.
  if (result.length > 0) {
    avfIndicesCache = { signature, indices: result };
  }
  return result;
}

const CAPTURE_SCREEN_LINE = /\[(\d+)\] Capture screen (\d+)/;

/**
 * `-list_devices` 출력에서 "[입력 인덱스] Capture screen N" 을 읽어 screen 0 부터
 * 연속된 번호의 입력 인덱스만 반환한다 (중간에 빠진 번호가 있으면 거기서 끊는다).
 */
function parseScreenInputIndices(stderr: string): number[] {
  const inputByScreen = new Map<number, number>();
  for (const line of stderr.split('\n')) {
    const m = CAPTURE_SCREEN_LINE.exec(line);
    if (m) inputByScreen.set(Number(m[2]), Number(m[1]));
  }
  const indices: number[] = [];
  let input = inputByScreen.get(0);
  while (input !== undefined) {
    indices.push(input);
    input = inputByScreen.get(indices.length);
  }
  return indices;
}
