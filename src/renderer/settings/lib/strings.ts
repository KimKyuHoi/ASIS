import { defineDict } from '../../../shared/i18n/language';
import type { RunningFeature } from '../../../shared/running-features';
import type { EditorTool } from '../../../shared/editor-hotkeys';

/** HotkeyConfig 의 키 집합 — 라벨 사전이 이 키를 모두 채우도록 강제한다. */
type HotkeyKey =
  | 'region' |
  'fullscreen' |
  'window' |
  'delayedFullscreen' |
  'delayedRegion' |
  'disableClickThrough' |
  'gif' |
  'video' |
  'ocr' |
  'clipboardPin' |
  'ruler' |
  'timeMachineToggle' |
  'timeMachineSave' |
  'stepGuide' |
  'scrollCapture';

/**
 * 환경설정 화면 문자열 사전.
 *
 * hotkeyLabels 는 Record<HotkeyKey, string> 형태를 유지해 단축키 필드와 1:1로
 * 매핑된다. languageKo/languageEn 은 언어 선택 option 라벨로, 각 언어를 그
 * 언어 자체 이름으로 표기하는 관례라 ko/en 사전에서 값이 동일하다.
 * seconds 는 값 뒤 단위 표기를 언어별로 붙이는 보간 함수다.
 */
export const settingsStrings = defineDict({
  ko: {
    title: '환경설정',
    languageSection: '언어 / Language',
    languageLabel: '표시 언어',
    languageKo: '한국어',
    languageEn: 'English',
    folderSection: '저장 위치',
    folderDefault: '기본값 (~/Pictures/ASIS)',
    change: '변경…',
    generalSection: '일반',
    gifFps: 'GIF 프레임 속도',
    pinOpacity: '핀 기본 투명도',
    captureSound: '캡처 완료 소리',
    openAtLogin: '로그인 시 자동 시작',
    tmBuffer: '타임머신 버퍼 (최근)',
    seconds: (n: number): string => `${n}초`,
    hotkeySection: '단축키',
    hotkeyHint: '해제하려면 버튼을 누른 뒤 ⌫(Backspace) 를 누르거나 옆의 ✕ 를 누르세요. 해제된 기능은 메뉴바 메뉴로만 실행됩니다.',
    recordingHint: '단축키 누르기… (⌫ 해제)',
    hotkeyNone: '없음',
    clearHotkey: '단축키 해제',
    editorHotkeySection: '에디터 도구 단축키',
    editorHotkeyHint: '수식키 없이 문자·숫자·F키 하나. 캡처 에디터 창 안에서만 동작합니다.',
    editorRecordingHint: '키 누르기… (⌫ 해제)',
    editorConflictWarning: (keys: string): string =>
      `${keys} 키가 여러 도구에 중복 지정됐습니다. 중복을 없애야 저장할 수 있습니다.`,
    reset: '기본값으로',
    save: '저장',
    conflictWarning: (keys: string): string =>
      `${keys} 이(가) 여러 기능에 중복 지정됐습니다. 중복을 없애야 저장할 수 있습니다.`,
    conflictBadge: '중복',
    runningWarning: (features: string): string =>
      `${features} 실행 중입니다. 단축키를 바꾸는 동안에는 전역 단축키가 잠시 멈추고, ESC 로 진행 중인 녹화가 취소될 수 있습니다.`,
    runningFeatureLabels: {
      timeMachine: '타임머신 녹화',
      gif: 'GIF 녹화',
      video: '화면 녹화',
      stepGuide: '스텝 가이드 녹화',
      scrollCapture: '스크롤 캡처',
    } as Record<RunningFeature, string>,
    hotkeyLabels: {
      region: '영역 캡처',
      fullscreen: '전체 화면 캡처',
      window: '윈도우 캡처',
      delayedFullscreen: '지연 전체화면 캡처 (3초)',
      delayedRegion: '지연 영역 캡처 (3초)',
      disableClickThrough: '클릭 통과 해제',
      gif: 'GIF 녹화',
      video: '화면 녹화',
      ocr: '텍스트 추출 (OCR)',
      clipboardPin: '클립보드 핀',
      ruler: '화면 자 / 간격 측정',
      timeMachineToggle: '타임머신 시작/정지',
      timeMachineSave: '타임머신 최근 구간 저장',
      stepGuide: '스텝 가이드 녹화',
      scrollCapture: '스크롤 캡처',
    } as Record<HotkeyKey, string>,
    // 에디터 툴바 라벨(editor/lib/strings.ts 의 tool)과 같은 표기를 쓴다.
    editorToolLabels: {
      select: '선택',
      rect: '사각형',
      ellipse: '원',
      arrow: '화살표',
      line: '직선',
      pen: '펜',
      text: '텍스트',
      step: '번호',
      highlight: '하이라이트',
      blur: '블러',
      mosaic: '모자이크',
      eraser: '지우개',
    } as Record<EditorTool, string>,
  },
  en: {
    title: 'Settings',
    languageSection: 'Language',
    languageLabel: 'Display Language',
    languageKo: '한국어',
    languageEn: 'English',
    folderSection: 'Save Location',
    folderDefault: 'Default (~/Pictures/ASIS)',
    change: 'Change…',
    generalSection: 'General',
    gifFps: 'GIF Frame Rate',
    pinOpacity: 'Default Pin Opacity',
    captureSound: 'Capture Sound',
    openAtLogin: 'Launch at Login',
    tmBuffer: 'Time Machine Buffer (Recent)',
    seconds: (n: number): string => `${n}s`,
    hotkeySection: 'Shortcuts',
    hotkeyHint: 'To remove a shortcut, click it and press ⌫ (Backspace), or click ✕ next to it. Removed actions stay available from the menu bar.',
    recordingHint: 'Press keys… (⌫ to remove)',
    hotkeyNone: 'None',
    clearHotkey: 'Remove shortcut',
    editorHotkeySection: 'Editor Tool Shortcuts',
    editorHotkeyHint: 'One letter, digit or F-key without modifiers. Works only inside the capture editor window.',
    editorRecordingHint: 'Press a key… (⌫ to remove)',
    editorConflictWarning: (keys: string): string =>
      `${keys} is assigned to more than one tool. Resolve the conflict to save.`,
    reset: 'Reset to Defaults',
    save: 'Save',
    conflictWarning: (keys: string): string =>
      `${keys} is assigned to more than one action. Resolve the conflict to save.`,
    conflictBadge: 'Conflict',
    runningWarning: (features: string): string =>
      `${features} is running. Global shortcuts pause while you record a new one, and ESC may cancel the recording in progress.`,
    runningFeatureLabels: {
      timeMachine: 'Time Machine recording',
      gif: 'GIF recording',
      video: 'Screen recording',
      stepGuide: 'Step Guide recording',
      scrollCapture: 'Scroll capture',
    } as Record<RunningFeature, string>,
    hotkeyLabels: {
      region: 'Region Capture',
      fullscreen: 'Fullscreen Capture',
      window: 'Window Capture',
      delayedFullscreen: 'Delayed Fullscreen Capture (3s)',
      delayedRegion: 'Delayed Region Capture (3s)',
      disableClickThrough: 'Disable Click-Through',
      gif: 'GIF Recording',
      video: 'Screen Recording',
      ocr: 'Text Extraction (OCR)',
      clipboardPin: 'Clipboard Pin',
      ruler: 'Screen Ruler / Spacing',
      timeMachineToggle: 'Time Machine Start/Stop',
      timeMachineSave: 'Save Recent Time Machine Clip',
      stepGuide: 'Step Guide Recording',
      scrollCapture: 'Scroll Capture',
    } as Record<HotkeyKey, string>,
    editorToolLabels: {
      select: 'Select',
      rect: 'Rectangle',
      ellipse: 'Ellipse',
      arrow: 'Arrow',
      line: 'Line',
      pen: 'Pen',
      text: 'Text',
      step: 'Number',
      highlight: 'Highlight',
      blur: 'Blur',
      mosaic: 'Mosaic',
      eraser: 'Eraser',
    } as Record<EditorTool, string>,
  },
});
