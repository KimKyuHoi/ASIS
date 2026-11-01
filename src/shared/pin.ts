/** main → renderer 첫 이미지 payload (pin:load-image). */
export type PinLoadPayload = {
  src: string;
  width: number;
  height: number;
  opacity: number;
};

/**
 * main → renderer click-through 상태 (pin:click-through-changed).
 * releaseHotkey — 전역 해제 단축키 표시 문자열(예: '⌘⇧X'). 해제('')됐으면 ''.
 */
export type PinClickThroughState = {
  enabled: boolean;
  releaseHotkey: string;
};
