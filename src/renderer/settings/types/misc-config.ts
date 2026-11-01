/** 기타 설정 — 필드는 src/main/settings.ts 의 MiscConfig 와 같게 유지한다. */
export type MiscConfig = {
  gifFps: number;
  gifAfterRecord: 'save' | 'clipboard' | 'editor';
  fullscreenScope: 'cursor' | 'all';
  appearance: 'system' | 'light' | 'dark';
  openAtLogin: boolean;
  captureSound: boolean;
  pinDefaultOpacity: number;
  delayedCaptureSeconds: number;
  afterCapture: 'editor' | 'clipboard';
  recordShowClicks: boolean;
  recordShowKeys: boolean;
};
