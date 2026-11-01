import type { HotkeyConfig } from '../types/hotkeys';

const SHIFT_CMD = 'CommandOrControl+Shift+';
const OPT_SHIFT_CMD = 'CommandOrControl+Shift+Alt+';

/**
 * 왼손 배치 — 모든 기능을 키보드 왼쪽 절반(⌘·⇧·⌥ + Q~T / A~G / Z~B / 1~5)으로 누른다.
 *
 *   ⇧⌘ + 글자   자주 쓰는 캡처·녹화 (기존 기본값 그대로 — 손에 익은 키를 바꾸지 않는다)
 *   ⌥⇧⌘ + 글자 도구·창 열기 (오른손 쪽이던 O·L·U·J 와 단축키가 없던 기능을 옮김)
 *
 * 충돌 확인: Apple "Mac keyboard shortcuts"(support.apple.com/en-us/102650) 에서
 * ⌥⇧⌘ 조합은 Q(즉시 로그아웃)·V(스타일 맞춰 붙여넣기)·Delete 뿐이라 이 셋은 피했다.
 * ⇧⌘3·4·5(시스템 스크린샷)·⇧⌘Z(다시 실행)·⇧⌘S(다른 이름으로 저장)·⇧⌘Q(로그아웃)도 쓰지 않는다.
 */
export const LEFT_HAND_HOTKEYS: HotkeyConfig = {
  region: `${SHIFT_CMD}A`,
  fullscreen: `${SHIFT_CMD}F`,
  window: `${SHIFT_CMD}W`,
  delayedFullscreen: `${SHIFT_CMD}D`,
  delayedRegion: `${OPT_SHIFT_CMD}D`,
  disableClickThrough: `${SHIFT_CMD}X`,
  gif: `${SHIFT_CMD}G`,
  video: `${SHIFT_CMD}E`,
  clipboardPin: `${SHIFT_CMD}V`,
  ruler: `${OPT_SHIFT_CMD}R`, // Ruler
  scrollCapture: `${OPT_SHIFT_CMD}S`, // Scroll
  stepGuide: `${OPT_SHIFT_CMD}C`, // Click guide
  closeAllPins: `${OPT_SHIFT_CMD}X`, // ⇧⌘X(핀 클릭 통과 해제) 옆
  history: `${OPT_SHIFT_CMD}A`, // All captures
  openSettings: `${OPT_SHIFT_CMD}1`,
  gifStudio: `${OPT_SHIFT_CMD}G`, // ⇧⌘G(GIF 녹화) 옆 — 녹화한 GIF 를 다듬는 곳
};
