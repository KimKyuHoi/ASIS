import { type ElectronAPI } from '@electron-toolkit/preload';
import type { HotkeyConfig, MiscConfig } from '../main/settings';
import type { Language } from '../shared/i18n/language';

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  windowId?: number;
};

type WindowInfo = { id: number; name: string; x: number; y: number; w: number; h: number };

/** main 의 displaySnapshot.ts 와 동일 형태 — raw 는 BGRA 픽셀(스트라이드 없음). */
type BackgroundPayload =
  | { kind: 'raw'; data: Uint8Array; width: number; height: number } |
  { kind: 'dataUrl'; dataUrl: string };

type SelectionAPI = {
  capture: (rect: Rect) => Promise<void>;
  cancel: () => void;
  onBackground: (callback: (payload: BackgroundPayload) => void) => () => void;
  onWindows: (callback: (windows: WindowInfo[]) => void) => () => void;
  ready: () => void;
  elementAt: (
    x: number,
    y: number,
  ) => Promise<{ x: number; y: number; w: number; h: number; name?: string } | null>;
  copyText: (text: string) => Promise<void>;
};

type EditorAPI = {
  onLoadImage: (
    callback: (imagePath: string, width: number, height: number) => void,
  ) => () => void;
  ready: () => void;
  copy: (dataUrl: string) => Promise<void>;
  cancel: () => void;
  pin: (dataUrl: string, w: number, h: number) => Promise<void>;
  save: (dataUrl: string) => Promise<{ saved: boolean; path?: string }>;
  saveFolder: (dataUrl: string) => Promise<{ path: string }>;
};

type PinAPI = {
  onLoadImage: (
    callback: (src: string, w: number, h: number, opacity: number) => void,
  ) => () => void;
  ready: () => void;
  close: () => void;
  setSize: (w: number, h: number) => void;
  setClickThrough: (enabled: boolean) => void;
};

type RecorderAPI = {
  stop: () => void;
  cancel: () => void;
  getFrameCount: () => Promise<number>;
  onEncoding: (callback: () => void) => () => void;
  onTriggerStop: (callback: () => void) => () => void;
  onTriggerCancel: (callback: () => void) => () => void;
};

type VideoRecorderAPI = {
  stop: () => void;
  cancel: () => void;
  onTriggerStop: (callback: () => void) => () => void;
  onTriggerCancel: (callback: () => void) => () => void;
};

type SettingsAPI = {
  get: () => Promise<HotkeyConfig>;
  set: (hotkeys: HotkeyConfig) => Promise<void>;
  getFolder: () => Promise<string>;
  setFolder: (path: string) => Promise<void>;
  pickFolder: () => Promise<string | null>;
  getMisc: () => Promise<MiscConfig>;
  setMisc: (misc: MiscConfig) => Promise<void>;
};

type HistoryEntry = {
  id: string;
  dataUrl: string;
  timestamp: number;
  width: number;
  height: number;
};

type HistoryAPI = {
  list: () => Promise<HistoryEntry[]>;
  copy: (dataUrl: string) => Promise<void>;
  pin: (dataUrl: string, w: number, h: number) => Promise<void>;
};

type PatchNote = {
  version: string;
  name: string;
  body: string;
  date: string;
  url: string;
};

type PatchHistoryAPI = {
  list: () => Promise<PatchNote[]>;
  openUrl: (url: string) => Promise<void>;
};

type StepGuideState = {
  stepCount: number;
  gifRecording: boolean;
};

type StepGuideAPI = {
  onState: (callback: (state: StepGuideState) => void) => () => void;
  startGif: () => void;
  stopGif: () => void;
  stop: (format: 'markdown' | 'html') => void;
};

type I18nAPI = {
  /** 현재 언어 동기 조회 — 엔트리 main.tsx 가 첫 렌더 전에 호출한다. */
  getLanguage: () => Language;
  setLanguage: (lang: Language) => Promise<void>;
  onLanguageChanged: (callback: (lang: Language) => void) => () => void;
  completeOnboarding: () => void;
};

type ScrollCaptureAPI = {
  stop: () => void;
  cancel: () => void;
  getFrameCount: () => Promise<number>;
  onStitching: (callback: () => void) => () => void;
  onTriggerStop: (callback: () => void) => () => void;
  onTriggerCancel: (callback: () => void) => () => void;
};

declare global {
  // eslint: .d.ts 는 consistent-type-definitions 룰 예외 (interface 필요 — Window augment).
  interface Window {
    electron: ElectronAPI;
    selection: SelectionAPI;
    editor: EditorAPI;
    pin: PinAPI;
    recorder: RecorderAPI;
    videoRecorder: VideoRecorderAPI;
    settings: SettingsAPI;
    captureHistory: HistoryAPI;
    patchHistory: PatchHistoryAPI;
    stepGuide: StepGuideAPI;
    scrollCapture: ScrollCaptureAPI;
    i18n: I18nAPI;
  }
}
