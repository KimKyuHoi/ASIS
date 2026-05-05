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
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('selection', selection);
    contextBridge.exposeInMainWorld('editor', editor);
  } catch (err) {
    console.error('preload: contextBridge expose failed', err);
  }
} else {
  // null-safety: 기대하지 않는 환경에서 silent fallback 하지 않고 명시 throw.
  throw new Error('preload: contextIsolation must be enabled');
}
