import type { GifOverlaySegment, GifOverlayTrack } from '../../../main/gif-studio/types';
import type { Shape } from '../../editor/types/shapes';
import { frameSpan, type FrameGrid } from './frame-grid';
import { renderFrameOverlay } from './frame-overlay-render';

/** 블러·모자이크는 그 프레임의 배경 픽셀로 굽는다 — 같은 도형이라도 프레임마다 결과가 다르다. */
function needsBackground(shapes: Shape[]): boolean {
  return shapes.some((s) => s.kind === 'blur' || s.kind === 'mosaic');
}

export type OverlaySources = {
  grid: FrameGrid;
  /** 주석이 있는 프레임만. */
  frames: ReadonlyMap<number, Shape[]>;
  size: { width: number; height: number };
  /** 프레임 k 의 정지화면 (블러·모자이크 프레임에만 부른다). */
  background: (k: number) => Promise<HTMLImageElement>;
  /** 진행률 — 구운 장 수 / 전체 장 수. */
  onProgress: (done: number, total: number) => void;
};

/**
 * 프레임별 주석 → 오버레이 트랙 (main/gif-studio/overlayTrack.ts 가 ffconcat 으로 합성).
 *
 * 프레임마다 그 프레임 도형을 투명 PNG 로 굽는다. 이웃 프레임과 도형이 같으면(복사로 여러
 * 프레임에 넣은 경우) 한 장을 함께 쓰고 구간을 합친다 — 같은 내용을 수백 번 굽지 않게.
 * 주석이 하나도 없으면 null.
 */
export async function buildOverlayTrack(src: OverlaySources): Promise<GifOverlayTrack | null> {
  if (src.frames.size === 0) return null;
  const pieces = groupFrames(src);
  const track: GifOverlayTrack = { images: [], segments: [] };
  await renderPieces(src, pieces, { track, byKey: new Map(), index: 0 });
  return track;
}

type RenderState = { track: GifOverlayTrack; byKey: Map<string, number>; index: number };

/**
 * 조각을 순서대로 하나씩 굽는다 — 배경 캡처가 video 하나를 공유해 동시에 돌릴 수 없다.
 * 떨어져 있어도 내용이 같은 조각(배경 없는)은 이미 구운 이미지를 다시 쓴다.
 */
async function renderPieces(
  src: OverlaySources,
  pieces: Piece[],
  state: RenderState,
): Promise<void> {
  const i = state.index;
  const piece = pieces.at(i);
  if (!piece) return;
  let image = piece.bgFrame === null ? state.byKey.get(piece.key) : undefined;
  if (image === undefined) {
    const bg = piece.bgFrame === null ? null : await src.background(piece.bgFrame);
    state.track.images.push(await renderFrameOverlay(piece.shapes, bg, src.size));
    image = state.track.images.length - 1;
    state.byKey.set(piece.key, image);
  }
  const segment: GifOverlaySegment = { ...piece.span, image };
  state.track.segments.push(segment);
  src.onProgress(i + 1, pieces.length);
  await renderPieces(src, pieces, { ...state, index: i + 1 });
}

type Piece = {
  span: { start: number; end: number };
  shapes: Shape[];
  /** 배경이 필요한 조각이면 그 프레임 번호 (그런 조각은 한 프레임짜리). */
  bgFrame: number | null;
  key: string;
};

function contentKey(shapes: Shape[]): string {
  return JSON.stringify(shapes.map(({ id: _id, ...rest }) => rest));
}

/** 프레임 순서대로 훑으며 같은 내용의 이웃 프레임을 한 조각으로 묶는다. */
function groupFrames({ grid, frames }: OverlaySources): Piece[] {
  const pieces: Piece[] = [];
  for (let k = 0; k < grid.count; k++) {
    // 주석이 없는 프레임은 정상 — 빈 목록(투명 PNG)으로 덮는다.
    const shapes = frames.get(k) ?? [];
    const bg = needsBackground(shapes);
    // id 는 복사할 때마다 새로 붙으므로 빼고 비교한다 — "모든 프레임에 복사" 한 내용이 한 장으로 합쳐지게.
    const key = bg ? `bg:${k}` : contentKey(shapes);
    const span = frameSpan(grid, k);
    const prev = pieces.at(-1);
    if (prev && !bg && prev.key === key) prev.span.end = span.end;
    else pieces.push({ span, shapes, bgFrame: bg ? k : null, key });
  }
  return pieces;
}
