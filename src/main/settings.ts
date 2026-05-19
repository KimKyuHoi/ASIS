import ElectronStore from 'electron-store';

export type HotkeyConfig = {
  region: string;
  fullscreen: string;
  window: string;
  disableClickThrough: string;
  sequenceGif: string;
  videoGif: string;
  clipboardPin: string;
};

export type MiscConfig = {
  /** GIF 인코딩 fps. 시퀀스/영상 GIF 모두 적용. */
  gifFps: number;
  /** 로그인 시 자동 시작 (macOS 로그인 항목). */
  openAtLogin: boolean;
  /** 캡처 완료 시 소리 재생. */
  captureSound: boolean;
  /** 핀 기본 투명도 (0.15 ~ 1.0). */
  pinDefaultOpacity: number;
};

export type Settings = {
  hotkeys: HotkeyConfig;
  /** 폴더 자동 저장 경로. 빈 문자열 = 기본값(~/Pictures/ASIS). */
  saveFolderPath: string;
  misc: MiscConfig;
  /** 직전 실행 시 버전 — 업데이트 완료 알림 감지에 사용. */
  lastLaunchedVersion: string;
};

export const DEFAULT_HOTKEYS: HotkeyConfig = {
  region: 'CommandOrControl+Shift+A',
  fullscreen: 'CommandOrControl+Shift+F',
  window: 'CommandOrControl+Shift+W',
  disableClickThrough: 'CommandOrControl+Shift+X',
  sequenceGif: 'CommandOrControl+Shift+G',
  videoGif: 'CommandOrControl+Shift+Alt+G',
  clipboardPin: 'CommandOrControl+Shift+V',
};

export const DEFAULT_MISC: MiscConfig = {
  gifFps: 15,
  openAtLogin: false,
  captureSound: true,
  pinDefaultOpacity: 1.0,
};

export const settingsStore = new ElectronStore<Settings>({
  defaults: {
    hotkeys: DEFAULT_HOTKEYS,
    saveFolderPath: '',
    misc: DEFAULT_MISC,
    lastLaunchedVersion: '',
  },
});
