import ElectronStore from 'electron-store';

export type HotkeyConfig = {
  region: string;
  fullscreen: string;
  window: string;
  delayedFullscreen: string;
  delayedRegion: string;
  disableClickThrough: string;
  gif: string;
  clipboardPin: string;
};

export type MiscConfig = {
  /** GIF 인코딩 fps. */
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
  delayedFullscreen: 'CommandOrControl+Shift+D',
  delayedRegion: 'CommandOrControl+Shift+Alt+D',
  disableClickThrough: 'CommandOrControl+Shift+X',
  gif: 'CommandOrControl+Shift+G',
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

/**
 * 저장된 hotkeys 를 DEFAULT_HOTKEYS 와 병합해 모든 키가 채워진 완전한 객체를 보장한다.
 * electron-store 의 defaults 는 top-level 키 단위로만 적용된다 — 중첩 객체인 hotkeys 의
 * 누락 필드는 deep-merge 하지 않으므로, 구버전에 저장된 부분 hotkeys 는 새로 추가된 키가
 * undefined 로 남는다. 그대로 렌더러로 넘어가면 toDisplayString(undefined) 가 throw 한다.
 * 읽는 시점에 병합해 이를 막는다.
 */
export function loadHotkeys(): HotkeyConfig {
  return { ...DEFAULT_HOTKEYS, ...settingsStore.get('hotkeys') };
}

/** misc 도 hotkeys 와 같은 이유로 읽는 시점에 DEFAULT_MISC 와 병합한다. */
export function loadMisc(): MiscConfig {
  return { ...DEFAULT_MISC, ...settingsStore.get('misc') };
}
