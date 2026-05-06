import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * 영역 선택 오버레이 IPC 브릿지.
 */
const selection = {
  capture: (rect: Rect): Promise<void> =>
    ipcRenderer.invoke('capture:region', rect),
  cancel: (): void => ipcRenderer.send('capture:cancel'),
};

/**
 * 어노테이션 에디터 IPC 브릿지.
 *  - onLoadImage(callback): main 이 mount 후 file://path + 크기 전송하면 콜백
 *  - copy(dataUrl): 합성 dataURL 을 main 으로 전달 → clipboard.writeImage
 *  - cancel(): ESC / ⌘W → main 이 윈도우 닫음
 *  - pin(dataUrl, w, h): 합성 dataURL 을 *떠있는 핀 윈도우* 로 띄움 (Snipaste 결)
 */
const editor = {
  onLoadImage: (
    callback: (imagePath: string, width: number, height: number) => void,
  ): void => {
    ipcRenderer.on(
      'editor:load-image',
      (_event, imagePath: string, width: number, height: number) => {
        callback(imagePath, width, height);
      },
    );
  },
  /**
   * renderer 의 useEffect 가 onLoadImage 콜백을 attach 한 *이후* 호출.
   * main 은 이 신호를 받고 image path 를 send → 메시지 유실 차단.
   */
  ready: (): void => ipcRenderer.send('editor:ready'),
  copy: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('editor:copy', dataUrl),
  cancel: (): void => ipcRenderer.send('editor:cancel'),
  pin: (dataUrl: string, w: number, h: number): Promise<void> =>
    ipcRenderer.invoke('editor:pin', dataUrl, w, h),
};

/**
 * Pin Window IPC 브릿지.
 *  - onLoadImage: main 으로부터 dataURL + 의도된 크기 받음
 *  - ready: editor 와 동일한 handshake
 *  - close: ESC / ⌘W / X 버튼 → 자기 윈도우 닫기
 *  - setSize: 줌/회전 시 핀 윈도우 크기 갱신
 *  - setClickThrough: X 토글 — 마우스 이벤트 통과
 */
const pin = {
  onLoadImage: (
    callback: (src: string, w: number, h: number) => void,
  ): void => {
    ipcRenderer.on(
      'pin:load-image',
      (_event, src: string, w: number, h: number) => {
        callback(src, w, h);
      },
    );
  },
  ready: (): void => ipcRenderer.send('pin:ready'),
  close: (): void => ipcRenderer.send('pin:close'),
  setSize: (w: number, h: number): void =>
    ipcRenderer.send('pin:set-size', w, h),
  setClickThrough: (enabled: boolean): void =>
    ipcRenderer.send('pin:set-click-through', enabled),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('selection', selection);
    contextBridge.exposeInMainWorld('editor', editor);
    contextBridge.exposeInMainWorld('pin', pin);
  } catch (err) {
    console.error('preload: contextBridge expose failed', err);
  }
} else {
  // null-safety: 기대하지 않는 환경에서 silent fallback 하지 않고 명시 throw.
  throw new Error('preload: contextIsolation must be enabled');
}
