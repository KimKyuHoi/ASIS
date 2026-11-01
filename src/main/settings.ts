import ElectronStore from 'electron-store';
import type { Language } from '../shared/i18n/language';
import { DEFAULT_EDITOR_HOTKEYS, type EditorHotkeyConfig } from '../shared/editor-hotkeys';

/**
 * 전역 단축키 — 값은 Electron accelerator 문자열.
 * 빈 문자열('', shared/editor-hotkeys.ts 의 HOTKEY_DISABLED)은 "해제" — 등록하지 않는다.
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

export type MiscConfig = {
  /** GIF 인코딩 fps. */
  gifFps: number;
  /**
   * GIF 녹화 종료 후 동작. 'save' = 저장 다이얼로그, 'clipboard' = 바로 클립보드 복사,
   * 'editor' = GIF 스튜디오에서 편집 후 저장/복사.
   */
  gifAfterRecord: 'save' | 'clipboard' | 'editor';
  /** 전체화면 캡처 범위. 'cursor' = 커서가 있는 화면, 'all' = 모든 화면을 배치대로 합침. */
  fullscreenScope: 'cursor' | 'all';
  /** 창 외형. nativeTheme.themeSource 로 그대로 넘긴다 — 'system' 은 macOS 설정을 따른다. */
  appearance: 'system' | 'light' | 'dark';
  /** 로그인 시 자동 시작 (macOS 로그인 항목). */
  openAtLogin: boolean;
  /** 캡처 완료 시 소리 재생. */
  captureSound: boolean;
  /** 핀 기본 투명도 (0.15 ~ 1.0). */
  pinDefaultOpacity: number;
  /** 지연 캡처 카운트다운 시간(초). 1~10. */
  delayedCaptureSeconds: number;
  /**
   * 이미지 캡처 후 동작. 'editor' = 에디터 열기, 'clipboard' = 바로 클립보드 복사.
   * 저장값이 목록에 없으면(예: 제거된 'quickAccess') loadMisc 가 기본값으로 되돌린다.
   * 옛 autoOpenEditor(boolean)는 loadMisc 가 이 값으로 옮긴다.
   */
  afterCapture: 'editor' | 'clipboard';
  /** GIF·화면 녹화에 클릭 위치 파동 링 표시. */
  recordShowClicks: boolean;
  /** GIF·화면 녹화에 누른 단축키(⌘·⌃ 조합, esc·F 키) 배지 표시. 손쉬운 사용 권한 필요. */
  recordShowKeys: boolean;
};

export type Settings = {
  hotkeys: HotkeyConfig;
  /** 폴더 자동 저장 경로. 빈 문자열 = 기본값(~/Pictures/ASIS). */
  saveFolderPath: string;
  misc: MiscConfig;
  /** 직전 실행 시 버전 — 업데이트 완료 알림 감지에 사용. */
  lastLaunchedVersion: string;
  /** 새 버전 공지(변경 이력 자동 표시)를 마지막으로 판정한 버전. '' = 기록 없음. */
  lastSeenReleaseNotes: string;
  /** UI 언어. '' = 첫 실행에서 아직 선택 안 함 → onboarding 언어 선택 창 표시. */
  language: Language | '';
  /** 에디터 도구 전환 키(V/R/O …). '' = 해제. */
  editorHotkeys: EditorHotkeyConfig;
};

const DEFAULT_HOTKEYS: HotkeyConfig = {
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
  // 아래는 새로 생긴 단축키 슬롯 — 기본 '해제'. 다른 앱 단축키를 예고 없이 가로채지 않도록
  // 사용자가 직접 지정하거나 설정 화면의 '왼손 배치' 프리셋으로 켠다.
  closeAllPins: '',
  history: '',
  openSettings: '',
  gifStudio: '',
};

const DEFAULT_MISC: MiscConfig = {
  gifFps: 15,
  // 이미지 캡처(autoOpenEditor: true)와 같은 결 — 녹화 후 스튜디오에서 다듬고 저장/복사.
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
};

export const settingsStore = new ElectronStore<Settings>({
  defaults: {
    hotkeys: DEFAULT_HOTKEYS,
    saveFolderPath: '',
    misc: DEFAULT_MISC,
    lastLaunchedVersion: '',
    lastSeenReleaseNotes: '',
    language: '',
    editorHotkeys: DEFAULT_EDITOR_HOTKEYS,
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
  // 디스크 값은 타입을 믿지 않는다 — 손상돼 null·문자열 등이면 기본값으로 시작한다
  // (여기서 throw 하면 앱 시작 자체가 막힌다).
  const stored: unknown = settingsStore.get('hotkeys');
  const merged: HotkeyConfig = { ...DEFAULT_HOTKEYS };
  if (typeof stored !== 'object' || stored === null) return merged;
  const saved = stored as Partial<HotkeyConfig>;
  // 현재 키만 옮긴다 — 제거된 기능(예: 타임머신)의 옛 키가 객체에 남아 settings:set 으로
  // 계속 재저장되거나, Object.keys 순회 시 라벨 lookup 이 undefined 가 되는 것을 막는다.
  // 값 타입은 거르지 않는다: 손상값(비문자열)은 ShortcutManager 가 '해제'로 복구하고 알린다.
  for (const key of Object.keys(DEFAULT_HOTKEYS) as (keyof HotkeyConfig)[]) {
    const value = saved[key];
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/** misc 도 hotkeys 와 같은 이유로 읽는 시점에 DEFAULT_MISC 와 병합한다. */
/**
 * 문자열 열거형 설정의 허용 값. 저장값이 손상되면 소비처(themeSource 대입, recorder 의
 * finishers[after] 조회 등)가 동기 throw 해 앱 시작이나 녹화 마무리가 통째로 건너뛰어진다
 * — 읽을 때 기본값으로 되돌리고, 저장할 때 거부한다.
 */
const MISC_ENUMS = {
  appearance: ['system', 'light', 'dark'],
  gifAfterRecord: ['editor', 'save', 'clipboard'],
  fullscreenScope: ['cursor', 'all'],
  afterCapture: ['editor', 'clipboard'],
} as const satisfies Partial<{ [K in keyof MiscConfig]: readonly MiscConfig[K][] }>;

type MiscEnumKey = keyof typeof MISC_ENUMS;

function isAllowed<K extends MiscEnumKey>(key: K, value: unknown): value is MiscConfig[K] {
  const allowed: readonly unknown[] = MISC_ENUMS[key];
  return allowed.includes(value);
}

/** 열거형 설정 중 허용 값이 아닌 키 — 없으면 null. settings:set-misc 의 저장 전 검증용. */
export function findInvalidMiscEnum(misc: MiscConfig): MiscEnumKey | null {
  const keys = Object.keys(MISC_ENUMS) as MiscEnumKey[];
  return keys.find((key) => !isAllowed(key, misc[key])) ?? null;
}

export function loadMisc(): MiscConfig {
  // loadHotkeys 와 같은 이유로 현재 키만 옮긴다 — 제거된 기능의 옛 키(timeMachineBufferSeconds 등)가
  // get → settings:set-misc 왕복으로 계속 재저장되지 않게.
  const stored: unknown = settingsStore.get('misc');
  const merged: MiscConfig = { ...DEFAULT_MISC };
  if (typeof stored !== 'object' || stored === null) return merged;
  const saved = stored as Partial<MiscConfig>;
  for (const key of Object.keys(DEFAULT_MISC) as (keyof MiscConfig)[]) {
    if (saved[key] !== undefined) Object.assign(merged, { [key]: saved[key] });
  }
  // 옛 autoOpenEditor:false(에디터 끄기 = 바로 복사)를 afterCapture 로 옮긴다. 다음 저장부터는 옛 키가 사라진다.
  const legacy = stored as { autoOpenEditor?: unknown };
  if (saved.afterCapture === undefined && legacy.autoOpenEditor === false) {
    merged.afterCapture = 'clipboard';
  }
  // 손상된 열거형 값은 기본값으로 되돌린다(376131e 와 같은 유형의 시작 실패 방지).
  for (const key of Object.keys(MISC_ENUMS) as MiscEnumKey[]) {
    if (!isAllowed(key, merged[key])) Object.assign(merged, { [key]: DEFAULT_MISC[key] });
  }
  return merged;
}

/** editorHotkeys 도 같은 이유로 DEFAULT_EDITOR_HOTKEYS 와 병합한다 (도구가 새로 추가될 때). */
export function loadEditorHotkeys(): EditorHotkeyConfig {
  return { ...DEFAULT_EDITOR_HOTKEYS, ...settingsStore.get('editorHotkeys') };
}
