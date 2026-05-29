import { type ElectronAPI } from '@electron-toolkit/preload';
import type { HotkeyConfig, MiscConfig } from '../main/settings';

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  windowId?: number;
};

type WindowInfo = { id: number; name: string; x: number; y: number; w: number; h: number };

type SelectionAPI = {
  capture: (rect: Rect) => Promise<void>;
  cancel: () => void;
  onBackground: (callback: (dataUrl: string) => void) => () => void;
  onWindows: (callback: (windows: WindowInfo[]) => void) => () => void;
  ready: () => void;
  elementAt: (
    x: number,
    y: number,
  ) => Promise<{ x: number; y: number; w: number; h: number; name?: string } | null>;
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

declare global {
  // eslint: .d.ts 는 consistent-type-definitions 룰 예외 (interface 필요 — Window augment).
  interface Window {
    electron: ElectronAPI;
    selection: SelectionAPI;
    editor: EditorAPI;
    pin: PinAPI;
    recorder: RecorderAPI;
    settings: SettingsAPI;
    captureHistory: HistoryAPI;
  }
}
