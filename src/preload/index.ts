import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import type { HotkeyConfig, MiscConfig } from '../main/settings';

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
  /** Color picker / Magnifier 용 — overlay 띄우기 전 화면의 dataURL.
      반환값은 cleanup — useEffect teardown 에서 호출해 리스너를 해제한다. */
  onBackground: (callback: (dataUrl: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, dataUrl: string): void => {
      callback(dataUrl);
    };
    ipcRenderer.on('capture:background', handler);
    return () => ipcRenderer.removeListener('capture:background', handler);
  },
  /** UI 자동 감지 — visible 윈도우 list. 권한 없으면 빈 배열.
      반환값은 cleanup — useEffect teardown 에서 호출해 리스너를 해제한다. */
  onWindows: (
    callback: (
      windows: Array<{ name: string; x: number; y: number; w: number; h: number }>,
    ) => void,
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      windows: Array<{ name: string; x: number; y: number; w: number; h: number }>,
    ): void => {
      callback(windows);
    };
    ipcRenderer.on('capture:windows', handler);
    return () => ipcRenderer.removeListener('capture:windows', handler);
  },
  /** onWindows listener 를 attach 한 후 호출 — main 에 "이제 보내도 됨" 신호. */
  ready: (): void => ipcRenderer.send('capture:ready'),
  /** 마우스 위치의 AXUIElement bounds 조회 — 손쉬운 사용 권한 없으면 null.
      name 은 AXTitle/AXRoleDescription/AXDescription 우선 순위. */
  elementAt: (
    x: number,
    y: number,
  ): Promise<{ x: number; y: number; w: number; h: number; name?: string } | null> =>
    ipcRenderer.invoke('capture:element-at', x, y),
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
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      imagePath: string,
      width: number,
      height: number,
    ): void => {
      callback(imagePath, width, height);
    };
    ipcRenderer.on('editor:load-image', handler);
    return () => ipcRenderer.removeListener('editor:load-image', handler);
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
  save: (dataUrl: string): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('editor:save', dataUrl),
  saveFolder: (dataUrl: string): Promise<{ path: string }> =>
    ipcRenderer.invoke('editor:save-folder', dataUrl),
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
    callback: (src: string, w: number, h: number, opacity: number) => void,
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      src: string,
      w: number,
      h: number,
      opacity: number,
    ): void => {
      callback(src, w, h, opacity);
    };
    ipcRenderer.on('pin:load-image', handler);
    return () => ipcRenderer.removeListener('pin:load-image', handler);
  },
  ready: (): void => ipcRenderer.send('pin:ready'),
  close: (): void => ipcRenderer.send('pin:close'),
  setSize: (w: number, h: number): void =>
    ipcRenderer.send('pin:set-size', w, h),
  setClickThrough: (enabled: boolean): void =>
    ipcRenderer.send('pin:set-click-through', enabled),
};

/**
 * 녹화 컨트롤 IPC 브릿지.
 *  - stop(): GIF 인코딩 + 결과 처리
 *  - cancel(): 폐기
 *  - getFrameCount(): 현재 frame 수 polling
 *  - onEncoding(cb): main 이 인코딩 시작했음을 알림 → UI 가 'encoding' 상태로
 */
const recorder = {
  stop: (): void => ipcRenderer.send('recorder:stop'),
  cancel: (): void => ipcRenderer.send('recorder:cancel'),
  getFrameCount: (): Promise<number> =>
    ipcRenderer.invoke('recorder:get-frame-count'),
  onEncoding: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on('recorder:encoding', handler);
    return () => ipcRenderer.removeListener('recorder:encoding', handler);
  },
  /** main 이 외부 트리거 (단축키/트레이) 로 정지 요청. renderer 가 자기 stop 흐름 실행. */
  onTriggerStop: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on('recorder:trigger-stop', handler);
    return () => ipcRenderer.removeListener('recorder:trigger-stop', handler);
  },
  onTriggerCancel: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on('recorder:trigger-cancel', handler);
    return () => ipcRenderer.removeListener('recorder:trigger-cancel', handler);
  },
};

/**
 * 환경설정 IPC 브릿지.
 *  - get(): 현재 핫키 설정 반환
 *  - set(hotkeys): 저장 + ShortcutManager 재등록
 *  - getFolder(): 저장 폴더 경로 반환 (빈 문자열 = 기본값)
 *  - setFolder(path): 저장 폴더 경로 갱신
 *  - pickFolder(): 네이티브 폴더 선택 다이얼로그
 *  - getMisc(): GIF fps/소리/로그인 등 기타 설정 반환
 *  - setMisc(misc): 저장 + 즉시 적용 (openAtLogin 등)
 */
const settings = {
  get: (): Promise<HotkeyConfig> => ipcRenderer.invoke('settings:get'),
  set: (hotkeys: HotkeyConfig): Promise<void> => ipcRenderer.invoke('settings:set', hotkeys),
  getFolder: (): Promise<string> => ipcRenderer.invoke('settings:get-folder'),
  setFolder: (path: string): Promise<void> => ipcRenderer.invoke('settings:set-folder', path),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('settings:pick-folder'),
  getMisc: (): Promise<MiscConfig> => ipcRenderer.invoke('settings:get-misc'),
  setMisc: (misc: MiscConfig): Promise<void> => ipcRenderer.invoke('settings:set-misc', misc),
};

type HistoryEntry = {
  id: string;
  dataUrl: string;
  timestamp: number;
  width: number;
  height: number;
};

/**
 * 캡처 히스토리 IPC 브릿지.
 * window.history 는 브라우저 내장 API — 충돌 방지를 위해 captureHistory 로 노출.
 */
const captureHistory = {
  list: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:list'),
  copy: (dataUrl: string): Promise<void> => ipcRenderer.invoke('history:copy', dataUrl),
  pin: (dataUrl: string, w: number, h: number): Promise<void> =>
    ipcRenderer.invoke('history:pin', dataUrl, w, h),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('selection', selection);
    contextBridge.exposeInMainWorld('editor', editor);
    contextBridge.exposeInMainWorld('pin', pin);
    contextBridge.exposeInMainWorld('recorder', recorder);
    contextBridge.exposeInMainWorld('settings', settings);
    contextBridge.exposeInMainWorld('captureHistory', captureHistory);
  } catch (err) {
    console.error('preload: contextBridge expose failed', err);
  }
} else {
  // null-safety: 기대하지 않는 환경에서 silent fallback 하지 않고 명시 throw.
  throw new Error('preload: contextIsolation must be enabled');
}
