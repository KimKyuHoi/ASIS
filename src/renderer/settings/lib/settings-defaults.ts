import { HOTKEY_DISABLED } from '../../../shared/editor-hotkeys';
import type { HotkeyConfig } from '../types/hotkeys';
import type { MiscConfig } from '../types/misc-config';

// 기본값은 src/main/settings.ts 의 DEFAULT_MISC 와 동일하게 유지한다.
export const DEFAULT_MISC: MiscConfig = {
  gifFps: 15,
  gifAfterRecord: 'editor',
  fullscreenScope: 'cursor',
  appearance: 'system',
  openAtLogin: false,
  captureSound: true,
  pinDefaultOpacity: 1.0,
  delayedCaptureSeconds: 3,
  afterCapture: 'editor',
  recordShowClicks: false,
  recordShowKeys: false,
  shareUsageStats: true,
};

export const DEFAULT_HOTKEYS: HotkeyConfig = {
  region: 'CommandOrControl+Shift+A',
  fullscreen: 'CommandOrControl+Shift+F',
  window: 'CommandOrControl+Shift+W',
  delayedFullscreen: 'CommandOrControl+Shift+D',
  delayedRegion: 'CommandOrControl+Shift+Alt+D',
  disableClickThrough: 'CommandOrControl+Shift+X',
  gif: 'CommandOrControl+Shift+G',
  video: 'CommandOrControl+Shift+E',
  clipboardPin: 'CommandOrControl+Shift+V',
  ruler: 'CommandOrControl+Shift+L',
  stepGuide: 'CommandOrControl+Shift+U',
  scrollCapture: 'CommandOrControl+Shift+J',
  closeAllPins: HOTKEY_DISABLED,
  history: HOTKEY_DISABLED,
  openSettings: HOTKEY_DISABLED,
  gifStudio: HOTKEY_DISABLED,
};

/** 설정 화면에 보이는 전역 단축키 순서. */
export const HOTKEY_FIELDS: (keyof HotkeyConfig)[] = [
  'region',
  'fullscreen',
  'window',
  'delayedFullscreen',
  'delayedRegion',
  'disableClickThrough',
  'gif',
  'video',
  'clipboardPin',
  'ruler',
  'stepGuide',
  'scrollCapture',
  'closeAllPins',
  'history',
  'openSettings',
  'gifStudio',
];

export const GIF_FPS_OPTIONS = [5, 10, 15, 20, 24, 30] as const;

/** 핀 기본 투명도 슬라이더 범위(%). */
export const PIN_OPACITY_RANGE = { min: 15, max: 100, step: 5 } as const;
