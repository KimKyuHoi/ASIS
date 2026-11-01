/**
 * 프레임 격자 — 편집 단위 "프레임 하나" 가 곧 내보낼 GIF 의 프레임 하나다.
 *
 * 트림 시작부터 원본 시간으로 step(= 속도 / FPS)초마다 한 프레임. ffmpeg 내보내기도
 * setpts=(PTS-STARTPTS)/speed → fps=F 로 같은 격자를 만들므로, 프레임 k 의 주석은
 * 출력 프레임 k 에 그대로 얹힌다 (main/gif-studio/overlayTrack.ts).
 */
export type FrameGrid = {
  /** 원본 초 — 트림 시작. */
  start: number;
  /** 원본 초 — 트림 끝. */
  end: number;
  /** 원본 초 — 한 프레임 길이. */
  step: number;
  count: number;
};

export function makeGrid(
  trim: { start: number; end: number },
  fps: number,
  speed: number,
): FrameGrid {
  const { start, end } = trim;
  const step = speed / fps;
  const count = Math.max(1, Math.round((end - start) / step));
  return { start, end, step, count };
}

/** 프레임 k 의 원본 시간 구간. 마지막 프레임은 트림 끝까지 덮는다. */
export function frameSpan(grid: FrameGrid, k: number): { start: number; end: number } {
  const start = grid.start + k * grid.step;
  const end = k === grid.count - 1 ? grid.end : start + grid.step;
  return { start, end };
}

/** 프레임 k 를 미리보기로 보여 줄 시각 — 경계값은 디코더에 따라 앞 프레임이 나올 수 있어 가운데. */
export function frameCenter(grid: FrameGrid, k: number): number {
  const { start, end } = frameSpan(grid, k);
  return (start + end) / 2;
}

/**
 * 프레임 k 로 내보내질 원본 장면을 뜰 시각 (편집 배경·블러/모자이크 배경).
 *
 * 실측(프레임 번호를 밝기로 넣은 30fps 영상, fps=10·7, 속도 1·2배): ffmpeg fps 필터는
 * 출력 프레임 k 에 "원본 시각이 start + (k + 0.5)·step 보다 *앞선* 마지막 원본 프레임" 을 쓴다.
 * <video> 는 시각 t 에서 "pts ≤ t 인 마지막 프레임" 을 보여 주므로 가운데에서 1ms 앞을 뜬다.
 */
export function frameSampleTime(grid: FrameGrid, k: number): number {
  const { start } = frameSpan(grid, k);
  return Math.max(start, frameCenter(grid, k) - 0.001);
}

/**
 * 재생 위치 t 에서 내보낸 GIF 가 보여 줄 프레임 — frameSampleTime 과 같은 규칙(가운데 기준
 * 반올림)이라 재생 미리보기의 주석 전환이 GIF 와 같은 시점에 일어난다.
 */
export function frameShownAt(grid: FrameGrid, t: number): number {
  return frameAt(grid, t + grid.step / 2);
}

/** 원본 시각 t 가 속한 프레임 (격자 밖이면 양끝으로). */
export function frameAt(grid: FrameGrid, t: number): number {
  const k = Math.floor((t - grid.start) / grid.step + 1e-6);
  return Math.min(grid.count - 1, Math.max(0, k));
}

/** 프레임 정지화면 캐시 키 — 같은 격자·같은 프레임일 때만 같다 (끝만 트림해도 마지막 프레임이 바뀐다). */
export function frameKey(grid: FrameGrid, k: number): string {
  return `${grid.start}:${grid.end}:${grid.step}:${k}`;
}
