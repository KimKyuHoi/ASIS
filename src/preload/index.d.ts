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
};

type EditorAPI = {
  onLoadImage: (
    callback: (imagePath: string, width: number, height: number) => void,
  ) => void;
  ready: () => void;
  copy: (dataUrl: string) => Promise<void>;
  cancel: () => void;
  pin: (dataUrl: string, w: number, h: number) => Promise<void>;
};

type PinAPI = {
  onLoadImage: (callback: (src: string, w: number, h: number) => void) => void;
  ready: () => void;
  close: () => void;
  setSize: (w: number, h: number) => void;
  setClickThrough: (enabled: boolean) => void;
};

declare global {
  // eslint: .d.ts 는 consistent-type-definitions 룰 예외 (interface 필요 — Window augment).
  interface Window {
    electron: ElectronAPI;
    selection: SelectionAPI;
    editor: EditorAPI;
    pin: PinAPI;
  }
}
