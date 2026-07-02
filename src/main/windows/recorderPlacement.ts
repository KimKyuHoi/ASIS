import type { Display } from 'electron';

/**
 * 녹화 알약(GIF·영상 공용) floating window 의 화면상 위치 계산.
 *
 * 순수 함수 — lifecycle 없음. RecorderWindowManager / VideoRecorderWindowManager
 * 양쪽에서 재사용한다 (imperative-style.md: 의도 명확하면 모듈 함수 명령형 OK).
 */

export type Placement = { x: number; y: number; hidden: boolean };

/**
 * 알약 위치 fitting — 캡처 rect 와 안 겹치는 곳 우선순위:
 *   1) menubar 영역 (display.bounds.y 위, workArea.y 아래)
 *   2) dock 아래 (workArea 아래)
 *   3) rect 위쪽 / 아래쪽 (workArea 안에서 rect 와 겹치지 않게)
 *   4) rect 우측 / 좌측
 *   5) hidden — rect 가 화면 거의 전체. 알약 안 띄움
 */
export function pickRecorderPlacement(
  rect: { x: number; y: number; w: number; h: number },
  recW: number,
  recH: number,
  display: Display,
): Placement {
  const bounds = display.bounds;
  const margin = 6;
  const centerX = Math.round(bounds.x + (bounds.width - recW) / 2);

  const candidates: Array<Placement> = [
    // menubar 영역 위쪽 (display.bounds.y ~ workArea.y).
    // workArea.y > bounds.y 이면 menubar 가 있고 그 위 공간이 있음.
    { x: centerX, y: bounds.y + 4, hidden: false },
    // dock 아래 (workArea 끝 ~ display.bounds 끝). 충분한 공간이 있을 때만.
    {
      x: centerX,
      y: bounds.y + bounds.height - recH - 4,
      hidden: false,
    },
    // rect 위 (workArea 안)
    {
      x: centerX,
      y: rect.y - recH - margin,
      hidden: false,
    },
    // rect 아래
    {
      x: centerX,
      y: rect.y + rect.h + margin,
      hidden: false,
    },
    // rect 우측
    {
      x: rect.x + rect.w + margin,
      y: rect.y,
      hidden: false,
    },
    // rect 좌측
    {
      x: rect.x - recW - margin,
      y: rect.y,
      hidden: false,
    },
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
    // 첫 번째 후보 (menubar/dock) 면 workArea 와 겹쳐도 OK — menubar/dock 영역.
    // 다른 후보들은 workArea 안이어야 자연스러움.
    return c;
  }

  // 모두 실패 — hidden. 좌표는 임의 (어차피 안 보임).
  return { x: bounds.x, y: bounds.y, hidden: true };
}

function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return !(
    a.x + a.w <= b.x ||
    a.x >= b.x + b.w ||
    a.y + a.h <= b.y ||
    a.y >= b.y + b.h
  );
}
