export type Point = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  windowId?: number;
};

/**
 * 드래그 상태 머신.
 *  idle      — 사용자가 아직 mouse down 안 함. ESC hint 표시.
 *  dragging  — pointer down 후 drag 중. start ↔ current 두 점 보관.
 *  committed — pointer up 후 IPC 전송 직전. 짧은 펄스 애니메이션 동안 유지.
 */
export type DragState =
  | { kind: 'idle' } |
  { kind: 'dragging'; start: Point; current: Point } |
  { kind: 'committed'; rect: Rect };

export type DragAction =
  | { type: 'pointer-down'; point: Point } |
  { type: 'pointer-move'; point: Point } |
  { type: 'pointer-up' };

/**
 * 화면 자(측정) 모드의 상태 머신.
 *  idle      — 아직 측정 사각형이 없음. 커서 hover 로 AX 요소 치수만 표시.
 *  dragging  — pointer down 후 측정 영역 드래그 중.
 *  measured  — pointer up 후 측정 결과 고정. 다시 드래그하면 새 측정으로 교체.
 *
 * DragState 와 분리한 이유: 측정 모드는 캡처로 이어지지 않고(commit 펄스·IPC 전송
 * 없음) measured 상태를 계속 유지한다. committed 처럼 짧게 살고 사라지는 상태와는
 * lifecycle 이 달라 별도 union 으로 둔다.
 */
export type RulerState =
  | { kind: 'idle' } |
  { kind: 'dragging'; start: Point; current: Point } |
  { kind: 'measured'; rect: Rect };

export type RulerAction =
  | { type: 'pointer-down'; point: Point } |
  { type: 'pointer-move'; point: Point } |
  { type: 'pointer-up' } |
  { type: 'clear' };

/** 오버레이 진입 모드. capture = 기존 영역 캡처, ruler = 측정 전용. */
export type OverlayMode =
  | 'capture' |
  'ruler';
