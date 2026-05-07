import { type ElectronAPI } from '@electron-toolkit/preload';

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type SelectionAPI = {
  capture: (rect: Rect) => Promise<void>;
  cancel: () => void;
  onBackground: (callback: (dataUrl: string) => void) => void;
};

type EditorAPI = {
  onLoadImage: (
    callback: (imagePath: string, width: number, height: number) => void,
  ) => void;
  ready: () => void;
  copy: (dataUrl: string) => Promise<void>;
  cancel: () => void;
  pin: (dataUrl: string, w: number, h: number) => Promise<void>;
  save: (dataUrl: string) => Promise<{ saved: boolean; path?: string }>;
};

type PinAPI = {
  onLoadImage: (callback: (src: string, w: number, h: number) => void) => void;
  ready: () => void;
  close: () => void;
  setSize: (w: number, h: number) => void;
  setClickThrough: (enabled: boolean) => void;
};

type RecorderAPI = {
  stop: () => void;
  cancel: () => void;
  getFrameCount: () => Promise<number>;
  onEncoding: (callback: () => void) => void;
  onTriggerStop: (callback: () => void) => void;
  onTriggerCancel: (callback: () => void) => void;
};

declare global {
  // eslint: .d.ts 는 consistent-type-definitions 룰 예외 (interface 필요 — Window augment).
  interface Window {
    electron: ElectronAPI;
    selection: SelectionAPI;
    editor: EditorAPI;
    pin: PinAPI;
    recorder: RecorderAPI;
  }
}
