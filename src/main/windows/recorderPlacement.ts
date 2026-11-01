import type { Display } from 'electron';

/**
 * 녹화 알약(GIF·영상 공용) floating window 의 화면상 위치 계산.
 *
 * 순수 함수 — lifecycle 없음. RecorderWindowManager / VideoRecorderWindowManager
 * 양쪽에서 재사용한다 (imperative-style.md: 의도 명확하면 모듈 함수 명령형 OK).
 *
 * 알약은 기본적으로 *녹화 영역 밖* 에 둔다. 캡처 방식마다 setContentProtection(true)
 * (NSWindowSharingNone) 의 효과가 다르기 때문이다 — 이 Mac(macOS 26.3) 실측
 * (record-region 세션, 공유 노트 recording-region-overlay.md):
 *   - screencapture -R (GIF·스크롤 캡처) → 보호 창이 프레임에서 *빠진다* (0/240000px)
 *   - ffmpeg avfoundation (화면 녹화)     → 보호 창이 그대로 *찍힌다* (240000/240000px)
 * 그래서 영역 밖에 자리가 없을 때 screencapture 기반 녹화는 placeInsideBottom 으로 영역
 * 안에 띄울 수 있지만, 화면 녹화는 그럴 수 없다.
 */

export type Placement = { x: number; y: number; hidden: boolean };

/** 영역 안쪽에 띄울 때 아래 가장자리와의 여백(pt). */
const INNER_BOTTOM_MARGIN = 24;

/**
 * 영역 밖에 자리가 없을 때(전체화면·큰 창) 알약을 영역 *안* 하단 가운데에 둔다.
 * screencapture 기반 녹화(GIF·스크롤, 그리고 전체화면 영상의 screencapture 엔진) 전용 —
 * 보호 창이 프레임에서 빠지므로 결과에 안 찍힌다. ffmpeg avfoundation 에는 찍히므로 그 엔진에는 쓰지 않는다.
 */
export function placeInsideBottom(
  rect: { x: number; y: number; w: number; h: number },
  pill: { w: number; h: number },
): Placement {
  return {
    x: Math.round(rect.x + (rect.w - pill.w) / 2),
    y: Math.round(rect.y + rect.h - pill.h - INNER_BOTTOM_MARGIN),
    hidden: false,
  };
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * 알약 위치 fitting.
 *
 *   1) 녹화 영역이 놓인 디스플레이 안에서 rect 와 안 겹치는 자리
 *      (menubar 영역 → dock 아래 → rect 위/아래 → rect 우/좌 순)
 *   2) 실패하면 *녹화 영역과 전혀 겹치지 않는 다른 디스플레이* 의 하단 중앙
 *      — 전체화면 창을 녹화할 때 보조 모니터가 있으면 여기로 간다.
 *   3) 그래도 없으면 hidden — 단일 모니터 전체화면 녹화. 알약 대신 알림·트레이로 안내.
 *
 * @param displays screen.getAllDisplays() 결과. 이전에는 primary 만 넘겨서,
 *   보조 모니터의 창을 녹화하면 후보 좌표가 primary 밖이라 전부 탈락 → 자리가
 *   남아 있는데도 무조건 hidden 이 되는 버그가 있었다.
 */
export function pickRecorderPlacement(
  rect: Box,
  pill: { w: number; h: number },
  displays: Display[],
): Placement {
  if (displays.length === 0) {
    // screen API 가 디스플레이를 하나도 못 주는 상황은 정상 동작이 아니다.
    throw new Error('pickRecorderPlacement — displays 가 비어 있다');
  }

  const target = displayHolding(rect, displays);
  const { w: recW, h: recH } = pill;

  const onTarget = placeOnDisplay(rect, pill, target);
  if (onTarget) return onTarget;

  for (const display of displays) {
    if (display.id === target.id) continue;
    // 녹화 영역이 조금이라도 걸치는 디스플레이는 후보에서 제외.
    if (rectsIntersect(displayBox(display), rect)) continue;
    const bounds = display.bounds;
    return {
      x: centerX(bounds, recW),
      // 하단에서 살짝 띄운다 — dock 과 겹쳐도 알약이 위(screen-saver level)라 보인다.
      y: bounds.y + bounds.height - recH - OTHER_DISPLAY_BOTTOM_GAP,
      hidden: false,
    };
  }

  // 모두 실패 — hidden. 좌표는 임의 (어차피 안 보임).
  return { x: target.bounds.x, y: target.bounds.y, hidden: true };
}

/**
 * 녹화 영역과 가장 많이 겹치는 디스플레이 — 영역이 걸쳐 있어도 "주 화면"을 고른다.
 * 동점이면 앞쪽 디스플레이. displays 가 비어 있지 않음은 호출자가 보장한다.
 */
function displayHolding(rect: Box, displays: Display[]): Display {
  let best = displays[0];
  let bestArea = intersectionArea(displayBox(best), rect);
  for (const display of displays.slice(1)) {
    const area = intersectionArea(displayBox(display), rect);
    if (area > bestArea) {
      bestArea = area;
      best = display;
    }
  }
  return best;
}

/** rect 와 알약 사이 간격(px). */
const RECT_GAP = 6;
/** menubar·dock 영역에 붙일 때 화면 가장자리와의 간격(px). */
const EDGE_GAP = 4;
/** 다른 디스플레이로 피할 때 하단 가장자리와의 간격(px). */
const OTHER_DISPLAY_BOTTOM_GAP = 24;

/** 디스플레이 가로 중앙에 폭 w 를 놓는 x. */
function centerX(bounds: { x: number; width: number }, w: number): number {
  return Math.round(bounds.x + (bounds.width - w) / 2);
}

function isInside(inner: Box, outer: Box): boolean {
  return inner.x >= outer.x &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y >= outer.y &&
    inner.y + inner.h <= outer.y + outer.h;
}

/** 한 디스플레이 안에서 rect 와 안 겹치는 자리 찾기. 없으면 null. */
function placeOnDisplay(
  rect: Box,
  pill: { w: number; h: number },
  display: Display,
): Placement | null {
  const bounds = display.bounds;
  const { w: recW, h: recH } = pill;
  const midX = centerX(bounds, recW);

  // 우선순위 순 후보 좌표.
  const candidates = [
    // menubar 영역 위쪽 (display.bounds.y ~ workArea.y).
    { x: midX, y: bounds.y + EDGE_GAP },
    // dock 아래 (workArea 끝 ~ display.bounds 끝).
    { x: midX, y: bounds.y + bounds.height - recH - EDGE_GAP },
    // rect 위·아래
    { x: midX, y: rect.y - recH - RECT_GAP },
    { x: midX, y: rect.y + rect.h + RECT_GAP },
    // rect 우측·좌측
    { x: rect.x + rect.w + RECT_GAP, y: rect.y },
    { x: rect.x - recW - RECT_GAP, y: rect.y },
  ];

  const displayRect = displayBox(display);
  const fit = candidates.find(({ x, y }) => {
    const box = { x, y, w: recW, h: recH };
    return isInside(box, displayRect) && !rectsIntersect(box, rect);
  });
  return fit ? { ...fit, hidden: false } : null;
}

function displayBox(display: Display): Box {
  const b = display.bounds;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

function intersectionArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

function rectsIntersect(a: Box, b: Box): boolean {
  return !(
    a.x + a.w <= b.x ||
    a.x >= b.x + b.w ||
    a.y + a.h <= b.y ||
    a.y >= b.y + b.h
  );
}
