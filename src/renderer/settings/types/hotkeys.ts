/**
 * 전역 단축키 설정 — 값은 Electron accelerator, HOTKEY_DISABLED('') 는 해제.
 * 필드는 src/main/settings.ts 의 HotkeyConfig 와 같게 유지한다.
 */
export type HotkeyConfig = {
  region: string;
  fullscreen: string;
  window: string;
  delayedFullscreen: string;
  delayedRegion: string;
  disableClickThrough: string;
  gif: string;
  video: string;
  clipboardPin: string;
  ruler: string;
  stepGuide: string;
  scrollCapture: string;
  closeAllPins: string;
  history: string;
  openSettings: string;
  gifStudio: string;
};
