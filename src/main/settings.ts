import ElectronStore from 'electron-store';
import type { Language } from '../shared/i18n/language';

export type HotkeyConfig = {
  region: string;
  fullscreen: string;
  window: string;
  delayedFullscreen: string;
  delayedRegion: string;
  disableClickThrough: string;
  gif: string;
  video: string;
  ocr: string;
  clipboardPin: string;
  ruler: string;
  timeMachineToggle: string;
  timeMachineSave: string;
  stepGuide: string;
  scrollCapture: string;
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
  /** 지연 캡처 카운트다운 시간(초). 1~10. */
  delayedCaptureSeconds: number;
  /** 캡처 후 에디터 자동 열기. false 면 에디터를 띄우지 않고 바로 클립보드에 복사. */
  autoOpenEditor: boolean;
  /** 타임머신 버퍼 유지 길이(초). 10~120. */
  timeMachineBufferSeconds: number;
  /** DRM 보호영역(검은 화면) 감지 시 알림. */
  drmDetectEnabled: boolean;
};

export type Settings = {
  hotkeys: HotkeyConfig;
  /** 폴더 자동 저장 경로. 빈 문자열 = 기본값(~/Pictures/ASIS). */
  saveFolderPath: string;
  misc: MiscConfig;
  /** 직전 실행 시 버전 — 업데이트 완료 알림 감지에 사용. */
  lastLaunchedVersion: string;
  /** UI 언어. '' = 첫 실행에서 아직 선택 안 함 → onboarding 언어 선택 창 표시. */
  language: Language | '';
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
  ocr: 'CommandOrControl+Shift+O',
  clipboardPin: 'CommandOrControl+Shift+V',
  ruler: 'CommandOrControl+Shift+L',
  timeMachineToggle: 'CommandOrControl+Shift+T',
  timeMachineSave: 'CommandOrControl+Shift+S',
  stepGuide: 'CommandOrControl+Shift+U',
  scrollCapture: 'CommandOrControl+Shift+J',
};

export const DEFAULT_MISC: MiscConfig = {
  gifFps: 15,
  openAtLogin: false,
  captureSound: true,
  pinDefaultOpacity: 1.0,
  delayedCaptureSeconds: 3,
  autoOpenEditor: true,
  timeMachineBufferSeconds: 30,
  drmDetectEnabled: true,
};

export const settingsStore = new ElectronStore<Settings>({
  defaults: {
    hotkeys: DEFAULT_HOTKEYS,
    saveFolderPath: '',
    misc: DEFAULT_MISC,
    lastLaunchedVersion: '',
    language: '',
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
