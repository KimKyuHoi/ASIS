/** 핀 이미지의 보기 변환 — 줌·회전·뒤집기·투명도. */
export type PinView = {
  zoom: number;
  /** degrees, 90 단위. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
};

export type PinViewAction =
  | { type: 'rotate'; delta: number } |
  { type: 'flip-x' } |
  { type: 'flip-y' } |
  { type: 'zoom-by'; factor: number } |
  { type: 'opacity-by'; delta: number } |
  { type: 'set-opacity'; opacity: number } |
  { type: 'reset' };

/** main 이 알려준 click-through 상태 + 상태 전환 토스트. */
export type PinLockState = {
  clickThrough: boolean;
  /** 전역 해제 단축키 표기. 해제(미할당)면 ''. */
  releaseHotkey: string;
  /** 직전 전환을 알리는 토스트. id 는 같은 방향 연속 전환에도 애니메이션을 다시 돌리기 위한 키. */
  toast: { id: number; locked: boolean } | null;
};
