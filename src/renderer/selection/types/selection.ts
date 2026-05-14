export type Point = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
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
