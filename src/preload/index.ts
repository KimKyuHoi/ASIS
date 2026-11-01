import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  GifExportRequest,
  GifExportResult,
  GifStudioAPI,
  GifStudioMedia,
  GifStudioPreview,
} from '../main/gif-studio/types';
import type { PinClickThroughState, PinLoadPayload } from '../shared/pin';
import type { GuideDraft, GuideEdits, GuideSaveResult } from '../shared/step-guide';
import type { HotkeyConfig, MiscConfig } from '../main/settings';
import type { RunningFeature } from '../shared/running-features';
import type { PatchNote } from '../main/patch-notes/patchNotes';
import type { Language } from '../shared/i18n/language';
import type { EditorHotkeyConfig } from '../shared/editor-hotkeys';
import type { HistoryEntry } from '../main/captureHistory';

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** main 의 displaySnapshot.ts 와 동일 형태 — raw 는 BGRA 픽셀(스트라이드 없음). */
type BackgroundPayload =
  | { kind: 'raw'; data: Uint8Array; width: number; height: number } |
  { kind: 'dataUrl'; dataUrl: string };

/**
 * 영역 선택 오버레이 IPC 브릿지.
 */
const selection = {
  capture: (rect: Rect): Promise<void> =>
    ipcRenderer.invoke('capture:region', rect),
  cancel: (): void => ipcRenderer.send('capture:cancel'),
  /** Color picker / Magnifier 용 — overlay 띄우기 전 화면 스냅샷.
      raw(BGRA) 또는 dataURL(폴백). 반환값은 cleanup — useEffect teardown 에서 호출. */
  onBackground: (callback: (payload: BackgroundPayload) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: BackgroundPayload): void => {
      callback(payload);
    };
    ipcRenderer.on('capture:background', handler);
    return () => ipcRenderer.removeListener('capture:background', handler);
  },
  /** UI 자동 감지 — visible 윈도우 list. 권한 없으면 빈 배열.
      반환값은 cleanup — useEffect teardown 에서 호출해 리스너를 해제한다. */
  onWindows: (
    callback: (
      windows: { name: string; x: number; y: number; w: number; h: number }[],
    ) => void,
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      windows: { name: string; x: number; y: number; w: number; h: number }[],
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
  /** 색상코드 등 텍스트 클립보드 복사 — main 의 clipboard.writeText 사용(포커스 무관). */
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write-text', text),
};

/**
 * 어노테이션 에디터 IPC 브릿지.
 *  - onLoadImage(callback): main 이 mount 후 PNG data URL + 크기 전송하면 콜백
 *  - copy(dataUrl): 합성 dataURL 을 main 으로 전달 → clipboard.writeImage
 *  - cancel(): ESC / ⌘W → main 이 윈도우 닫음
 *  - pin(dataUrl, w, h): 합성 dataURL 을 *떠있는 핀 윈도우* 로 띄움 (Snipaste 결)
 */
const editor = {
  onLoadImage: (
    callback: (imagePath: string, width: number, height: number) => void,
  ): (() => void) => {
    // (event, path, w, h) 4개 — max-params(3) 때문에 rest 튜플로 받는다.
    type Args = [IpcRendererEvent, string, number, number];
    const handler = (...[, imagePath, width, height]: Args): void => {
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
  /** 다시 편집 — 히스토리 [편집]. 값은 renderer 가 parseEditorProject 로 검증한다. */
  onLoadProject: (callback: (project: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, project: unknown): void => {
      callback(project);
    };
    ipcRenderer.on('editor:load-project', handler);
    return () => ipcRenderer.removeListener('editor:load-project', handler);
  },
  // project: 다시 편집용(주석 없는 배경 + 도형) — main 이 검증해 히스토리에 함께 남긴다.
  copy: (dataUrl: string, project: unknown): Promise<void> =>
    ipcRenderer.invoke('editor:copy', dataUrl, project),
  cancel: (): void => ipcRenderer.send('editor:cancel'),
  // 4개 인자 — max-params(3) 때문에 rest 튜플로 받는다 (main 핸들러와 같은 모양).
  pin: (...[dataUrl, w, h, project]: [string, number, number, unknown]): Promise<void> =>
    ipcRenderer.invoke('editor:pin', dataUrl, w, h, project),
  save: (dataUrl: string): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('editor:save', dataUrl),
  saveFolder: (dataUrl: string): Promise<{ path: string }> =>
    ipcRenderer.invoke('editor:save-folder', dataUrl),
  /** 도구 전환 키 표(V/R/O …). 환경설정에서 바꾸면 onHotkeysChanged 로 push 된다. */
  getHotkeys: (): Promise<EditorHotkeyConfig> =>
    ipcRenderer.invoke('settings:get-editor-hotkeys'),
  onHotkeysChanged: (callback: (hotkeys: EditorHotkeyConfig) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, hotkeys: EditorHotkeyConfig): void => {
      callback(hotkeys);
    };
    ipcRenderer.on('settings:editor-hotkeys-changed', handler);
    return () => ipcRenderer.removeListener('settings:editor-hotkeys-changed', handler);
  },
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
  onLoadImage: (callback: (payload: PinLoadPayload) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: PinLoadPayload): void => {
      callback(payload);
    };
    ipcRenderer.on('pin:load-image', handler);
    return () => ipcRenderer.removeListener('pin:load-image', handler);
  },
  onClickThroughChanged: (
    callback: (state: PinClickThroughState) => void,
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, state: PinClickThroughState): void => {
      callback(state);
    };
    ipcRenderer.on('pin:click-through-changed', handler);
    return () => ipcRenderer.removeListener('pin:click-through-changed', handler);
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
 * 화면 영상 녹화 컨트롤 IPC 브릿지.
 *  - stop(): 녹화 정지 → .mov 저장 다이얼로그
 *  - cancel(): 폐기
 *  - onTriggerStop/onTriggerCancel(cb): main 이 외부(단축키/트레이) 로 정지·취소 요청
 * GIF recorder 와 달리 프레임 개념·인코딩 단계가 없다. onXxx 는 cleanup 반환.
 */
const videoRecorder = {
  stop: (): void => ipcRenderer.send('video-recorder:stop'),
  cancel: (): void => ipcRenderer.send('video-recorder:cancel'),
  onTriggerStop: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on('video-recorder:trigger-stop', handler);
    return () =>
      ipcRenderer.removeListener('video-recorder:trigger-stop', handler);
  },
  onTriggerCancel: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on('video-recorder:trigger-cancel', handler);
    return () =>
      ipcRenderer.removeListener('video-recorder:trigger-cancel', handler);
  },
};

/**
 * 환경설정 IPC 브릿지.
 *  - get(): 현재 핫키 설정 반환
 *  - set(hotkeys): 저장 + ShortcutManager 재등록
 *  - getFolder(): 저장 폴더 경로 반환 (빈 문자열 = 기본값)
 *  - pickFolder(): 네이티브 폴더 선택 다이얼로그
 *  - getMisc(): GIF fps/소리/로그인 등 기타 설정 반환
 *  - setMisc(misc): 저장 + 즉시 적용 (openAtLogin 등)
 *  - close(): ESC — 환경설정 창 닫기
 *  - setHotkeyRecording(active): 녹화 동안 전역 단축키·메뉴 accelerator 억제 토글
 */
const settings = {
  get: (): Promise<HotkeyConfig> => ipcRenderer.invoke('settings:get'),
  set: (hotkeys: HotkeyConfig): Promise<void> => ipcRenderer.invoke('settings:set', hotkeys),
  getFolder: (): Promise<string> => ipcRenderer.invoke('settings:get-folder'),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('settings:pick-folder'),
  getMisc: (): Promise<MiscConfig> => ipcRenderer.invoke('settings:get-misc'),
  setMisc: (misc: MiscConfig): Promise<void> => ipcRenderer.invoke('settings:set-misc', misc),
  close: (): void => ipcRenderer.send('settings:close'),
  getRunningFeatures: (): Promise<RunningFeature[]> =>
    ipcRenderer.invoke('settings:get-running-features'),
  setHotkeyRecording: (active: boolean): void =>
    ipcRenderer.send('settings:hotkey-recording', active),
  getEditorHotkeys: (): Promise<EditorHotkeyConfig> =>
    ipcRenderer.invoke('settings:get-editor-hotkeys'),
  setEditorHotkeys: (hotkeys: EditorHotkeyConfig): Promise<void> =>
    ipcRenderer.invoke('settings:set-editor-hotkeys', hotkeys),
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
  /** [편집] — 그 항목의 편집본을 에디터로 연다 (editable 인 항목만). */
  edit: (id: string): Promise<void> => ipcRenderer.invoke('history:edit', id),
};

/**
 * 변경 이력 IPC 브릿지 — GitHub Releases 조회(main 이 fetch).
 */
const patchHistory = {
  list: (): Promise<PatchNote[]> => ipcRenderer.invoke('patch-history:list'),
  openUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('patch-history:open-url', url),
};

/**
 * 스텝 가이드 IPC 브릿지 — 수동 이미지/GIF 모드.
 *  - onState(cb): main 이 클릭 스텝 수 + GIF 녹화 여부를 push
 *  - startGif()/stopGif(): [GIF 시작]/[GIF 정지] — 연속 GIF 녹화 제어
 *  - stop(format): 종료 + 형식 지정 export
 */
const stepGuide = {
  onState: (
    callback: (state: { stepCount: number; gifRecording: boolean }) => void,
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      state: { stepCount: number; gifRecording: boolean },
    ): void => {
      callback(state);
    };
    ipcRenderer.on('step-guide:step-count', handler);
    return () => ipcRenderer.removeListener('step-guide:step-count', handler);
  },
  startGif: (): void => ipcRenderer.send('step-guide:start-gif'),
  stopGif: (): void => ipcRenderer.send('step-guide:stop-gif'),
  stop: (format: 'markdown' | 'html'): void =>
    ipcRenderer.send('step-guide:stop', format),
  /** [취소]·ESC — 기록한 단계와 임시 파일을 버리고 편집 창을 열지 않는다. */
  cancel: (): void => ipcRenderer.send('step-guide:cancel'),
};

/**
 * 스크롤 캡처 IPC 브릿지 — 주기 캡처 → 세로 스티칭.
 */
const scrollCapture = {
  stop: (): void => ipcRenderer.send('scroll-capture:stop'),
  cancel: (): void => ipcRenderer.send('scroll-capture:cancel'),
  /** 시작할 때 고른 스크롤 방향 — 자동 스크롤이 이 방향으로 진행한다. */
  chooseDirection: (direction: 'up' | 'down'): void =>
    ipcRenderer.send('scroll-capture:direction', direction),
  /** 진행 상황 — 찍은 장수, 지금까지 이어 붙인 높이(px), 이어 붙이지 못한 구간 수. */
  getProgress: (): Promise<{ frames: number; height: number; gaps: number }> =>
    ipcRenderer.invoke('scroll-capture:get-progress'),
  onStitching: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on('scroll-capture:stitching', handler);
    return () =>
      ipcRenderer.removeListener('scroll-capture:stitching', handler);
  },
  onTriggerStop: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on('scroll-capture:trigger-stop', handler);
    return () =>
      ipcRenderer.removeListener('scroll-capture:trigger-stop', handler);
  },
  onTriggerCancel: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on('scroll-capture:trigger-cancel', handler);
    return () =>
      ipcRenderer.removeListener('scroll-capture:trigger-cancel', handler);
  },
};

/**
 * 언어(i18n) IPC 브릿지.
 *  - getLanguage(): 현재 언어 동기 조회 — 첫 페인트 전에 언어가 결정돼야 해서 sendSync.
 *    main 의 핸들러는 즉시 returnValue 응답이라 블로킹은 준비된 값 1회 왕복뿐이다.
 *  - setLanguage(lang): 저장 + 전체 앱 반영 (설정 창·onboarding 에서 호출)
 *  - onLanguageChanged(cb): main broadcast 구독. 반환값은 cleanup — 엔트리 모듈
 *    스코프의 앱 수명 구독은 cleanup 을 호출하지 않는다 (ipc-init 예외 패턴).
 *  - completeOnboarding(): 첫 실행 언어 선택 창 닫기 요청.
 */
const i18n = {
  getLanguage: (): Language => ipcRenderer.sendSync('i18n:get-language') as Language,
  setLanguage: (lang: Language): Promise<void> =>
    ipcRenderer.invoke('i18n:set-language', lang),
  onLanguageChanged: (callback: (lang: Language) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, lang: Language): void => {
      callback(lang);
    };
    ipcRenderer.on('i18n:language-changed', handler);
    return () => ipcRenderer.removeListener('i18n:language-changed', handler);
  },
  completeOnboarding: (): void => ipcRenderer.send('i18n:onboarding-done'),
};

/**
 * 스텝 가이드 편집 창 IPC 브릿지.
 *  - getDraft(): 이 창에 배정된 녹화 결과(이미지 포함)
 *  - save(edits): main 이 저장 다이얼로그 → 단일 HTML 쓰기
 */
const stepGuideEditor = {
  getDraft: (): Promise<GuideDraft> => ipcRenderer.invoke('step-guide-editor:get-draft'),
  save: (edits: GuideEdits): Promise<GuideSaveResult> =>
    ipcRenderer.invoke('step-guide-editor:save', edits),
};

/** GIF 스튜디오 IPC 브릿지 — main 의 windows/gifStudioWindow.ts 와 채널 동형. */
const gifStudio: GifStudioAPI = {
  getMedia: (): Promise<GifStudioMedia | null> => ipcRenderer.invoke('gif-studio:get-media'),
  onMedia: (callback: (media: GifStudioMedia) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, media: GifStudioMedia): void => {
      callback(media);
    };
    ipcRenderer.on('gif-studio:media', handler);
    return () => {
      ipcRenderer.removeListener('gif-studio:media', handler);
    };
  },
  loadPreview: (path: string): Promise<GifStudioPreview> =>
    ipcRenderer.invoke('gif-studio:load-preview', path),
  pick: (): Promise<boolean> => ipcRenderer.invoke('gif-studio:pick'),
  export: (request: GifExportRequest): Promise<GifExportResult> =>
    ipcRenderer.invoke('gif-studio:export', request),
  cancelExport: (): Promise<void> => ipcRenderer.invoke('gif-studio:cancel-export'),
  reveal: (path: string): Promise<void> => ipcRenderer.invoke('gif-studio:reveal', path),
  close: (): void => {
    ipcRenderer.send('gif-studio:close');
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('selection', selection);
    contextBridge.exposeInMainWorld('editor', editor);
    contextBridge.exposeInMainWorld('pin', pin);
    contextBridge.exposeInMainWorld('recorder', recorder);
    contextBridge.exposeInMainWorld('videoRecorder', videoRecorder);
    contextBridge.exposeInMainWorld('settings', settings);
    contextBridge.exposeInMainWorld('captureHistory', captureHistory);
    contextBridge.exposeInMainWorld('patchHistory', patchHistory);
    contextBridge.exposeInMainWorld('stepGuide', stepGuide);
    contextBridge.exposeInMainWorld('stepGuideEditor', stepGuideEditor);
    contextBridge.exposeInMainWorld('scrollCapture', scrollCapture);
    contextBridge.exposeInMainWorld('gifStudio', gifStudio);
    contextBridge.exposeInMainWorld('i18n', i18n);
  } catch (err) {
    console.error('preload: contextBridge expose failed', err);
  }
} else {
  // null-safety: 기대하지 않는 환경에서 silent fallback 하지 않고 명시 throw.
  throw new Error('preload: contextIsolation must be enabled');
}
