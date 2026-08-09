import type { Display } from 'electron';

/**
 * 녹화 알약(GIF·영상 공용) floating window 의 화면상 위치 계산.
 *
 * 순수 함수 — lifecycle 없음. RecorderWindowManager / VideoRecorderWindowManager
 * 양쪽에서 재사용한다 (imperative-style.md: 의도 명확하면 모듈 함수 명령형 OK).
 *
 * 알약은 *녹화 영역과 겹치면 안 된다*. setContentProtection(true) 를 걸어 두긴
 * 했지만 macOS 에서 그건 NSWindowSharingNone 일 뿐이고, Electron 문서가 밝히듯
 * ScreenCaptureKit 기반 캡처(우리가 쓰는 screencapture 포함)는 그 보호를 무시하고
 * 창을 그대로 찍는다. 겹쳐 띄우면 결과물에 알약이 박힌다.
 * 출처: electronjs.org/docs/latest/api/browser-window (setContentProtection).
 */

export type Placement = { x: number; y: number; hidden: boolean };

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
  recW: number,
  recH: number,
  displays: Display[],
): Placement {
  if (displays.length === 0) {
    // screen API 가 디스플레이를 하나도 못 주는 상황은 정상 동작이 아니다.
    throw new Error('pickRecorderPlacement — displays 가 비어 있다');
  }

  const target = displayHolding(rect, displays);

  const onTarget = placeOnDisplay(rect, recW, recH, target);
  if (onTarget) return onTarget;

  for (const display of displays) {
    if (display.id === target.id) continue;
    // 녹화 영역이 조금이라도 걸치는 디스플레이는 후보에서 제외.
    if (rectsIntersect(displayBox(display), rect)) continue;
    const bounds = display.bounds;
    return {
      x: Math.round(bounds.x + (bounds.width - recW) / 2),
      // 하단에서 살짝 띄운다 — dock 과 겹쳐도 알약이 위(screen-saver level)라 보인다.
      y: bounds.y + bounds.height - recH - 24,
      hidden: false,
    };
  }

  // 모두 실패 — hidden. 좌표는 임의 (어차피 안 보임).
  return { x: target.bounds.x, y: target.bounds.y, hidden: true };
}

/** 녹화 영역과 가장 많이 겹치는 디스플레이 — 영역이 걸쳐 있어도 "주 화면"을 고른다. */
function displayHolding(rect: Box, displays: Display[]): Display {
  let best = displays[0];
  if (!best) throw new Error('displayHolding — displays 가 비어 있다');
  let bestArea = -1;
  for (const display of displays) {
    const area = intersectionArea(displayBox(display), rect);
    if (area > bestArea) {
      bestArea = area;
      best = display;
    }
  }
  return best;
}

/** 한 디스플레이 안에서 rect 와 안 겹치는 자리 찾기. 없으면 null. */
function placeOnDisplay(
  rect: Box,
  recW: number,
  recH: number,
  display: Display,
): Placement | null {
  const bounds = display.bounds;
  const margin = 6;
  const centerX = Math.round(bounds.x + (bounds.width - recW) / 2);

  const candidates: Placement[] = [
    // menubar 영역 위쪽 (display.bounds.y ~ workArea.y).
    { x: centerX, y: bounds.y + 4, hidden: false },
    // dock 아래 (workArea 끝 ~ display.bounds 끝).
    { x: centerX, y: bounds.y + bounds.height - recH - 4, hidden: false },
    // rect 위
    { x: centerX, y: rect.y - recH - margin, hidden: false },
    // rect 아래
    { x: centerX, y: rect.y + rect.h + margin, hidden: false },
    // rect 우측
    { x: rect.x + rect.w + margin, y: rect.y, hidden: false },
    // rect 좌측
    { x: rect.x - recW - margin, y: rect.y, hidden: false },
  ];

  for (const c of candidates) {
    const cBox = { x: c.x, y: c.y, w: recW, h: recH };
    const inDisplay =
      cBox.x >= bounds.x &&
      cBox.x + cBox.w <= bounds.x + bounds.width &&
      cBox.y >= bounds.y &&
      cBox.y + cBox.h <= bounds.y + bounds.height;
    if (!inDisplay) continue;
    if (rectsIntersect(cBox, rect)) continue;
    return c;
  }

  return null;
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
