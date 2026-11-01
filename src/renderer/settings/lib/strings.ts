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
  'clipboardPin' |
  'ruler' |
  'stepGuide' |
  'scrollCapture' |
  'closeAllPins' |
  'history' |
  'openSettings' |
  'gifStudio';

/**
 * 환경설정 화면 문자열 사전.
 *
 * hotkeyLabels 는 Record<HotkeyKey, string> 형태를 유지해 단축키 필드와 1:1로
 * 매핑된다. languageKo/languageEn 은 언어 선택 option 라벨로, 각 언어를 그
 * 언어 자체 이름으로 표기하는 관례라 ko/en 사전에서 값이 동일하다.
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
    afterCapture: '캡처 후',
    afterCaptureEditor: '에디터 열기',
    afterCaptureClipboard: '클립보드에 바로 복사',
    gifAfterRecord: 'GIF 녹화 후',
    gifAfterSave: '파일로 저장',
    gifAfterClipboard: '클립보드에 바로 복사',
    gifAfterEditor: 'GIF 스튜디오에서 편집',
    recordShowClicks: '녹화에 클릭 위치 표시',
    recordShowKeys: '녹화에 누른 단축키 표시',
    recordShowKeysHint: '⌘·⌃ 조합과 esc·F 키만 표시하고 일반 타이핑은 남기지 않습니다. 손쉬운 사용 권한이 필요합니다.',
    appearance: '화면 모드',
    appearanceSystem: '시스템 설정 따르기',
    appearanceLight: '라이트',
    appearanceDark: '다크',
    fullscreenScope: '전체화면 캡처 범위',
    fullscreenScopeCursor: '커서가 있는 화면',
    fullscreenScopeAll: '모든 화면 합치기',
    pinOpacity: '핀 기본 투명도',
    captureSound: '캡처 완료 소리',
    openAtLogin: '로그인 시 자동 시작',
    hotkeySection: '단축키',
    hotkeyHint: '해제하려면 버튼을 누른 뒤 ⌫(Backspace) 를 누르거나 옆의 ✕ 를 누르세요. 해제된 기능은 메뉴바 메뉴로만 실행됩니다.',
    leftHandPreset: '왼손 배치 적용',
    leftHandPresetHint: '모든 기능을 키보드 왼쪽(⇧⌘·⌥⇧⌘ + 왼손 글자)으로 배치합니다. 적용 후 저장을 눌러야 반영됩니다.',
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
      gif: 'GIF 녹화',
      video: '화면 녹화',
      stepGuide: '스텝 가이드 녹화',
      scrollCapture: '스크롤 캡처',
    } satisfies Record<RunningFeature, string>,
    hotkeyLabels: {
      region: '영역 캡처',
      fullscreen: '전체 화면 캡처',
      window: '윈도우 캡처',
      delayedFullscreen: '지연 전체화면 캡처 (3초)',
      delayedRegion: '지연 영역 캡처 (3초)',
      disableClickThrough: '클릭 통과 해제',
      gif: 'GIF 녹화',
      video: '화면 녹화',
      clipboardPin: '클립보드 핀',
      ruler: '화면 자 / 간격 측정',
      stepGuide: '스텝 가이드 녹화',
      scrollCapture: '스크롤 캡처',
      closeAllPins: '모든 핀 닫기',
      history: '캡처 히스토리',
      openSettings: '환경설정 열기',
      gifStudio: 'GIF 스튜디오',
    } satisfies Record<HotkeyKey, string>,
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
    } satisfies Record<EditorTool, string>,
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
    afterCapture: 'After Capture',
    afterCaptureEditor: 'Open editor',
    afterCaptureClipboard: 'Copy to clipboard',
    gifAfterRecord: 'After GIF Recording',
    gifAfterSave: 'Save to file',
    gifAfterClipboard: 'Copy to clipboard',
    gifAfterEditor: 'Edit in GIF Studio',
    recordShowClicks: 'Show clicks in recordings',
    recordShowKeys: 'Show pressed shortcuts in recordings',
    recordShowKeysHint: 'Only ⌘/⌃ combinations and esc/F keys are shown; regular typing is never recorded. Requires Accessibility permission.',
    appearance: 'Appearance',
    appearanceSystem: 'Use system setting',
    appearanceLight: 'Light',
    appearanceDark: 'Dark',
    fullscreenScope: 'Full Screen Capture',
    fullscreenScopeCursor: 'Screen with pointer',
    fullscreenScopeAll: 'All screens combined',
    pinOpacity: 'Default Pin Opacity',
    captureSound: 'Capture Sound',
    openAtLogin: 'Launch at Login',
    hotkeySection: 'Shortcuts',
    hotkeyHint: 'To remove a shortcut, click it and press ⌫ (Backspace), or click ✕ next to it. Removed actions stay available from the menu bar.',
    leftHandPreset: 'Apply Left-Hand Layout',
    leftHandPresetHint: 'Puts every feature on the left side of the keyboard (⇧⌘ / ⌥⇧⌘ + left-hand letters). Click Save to apply.',
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
      gif: 'GIF recording',
      video: 'Screen recording',
      stepGuide: 'Step Guide recording',
      scrollCapture: 'Scroll capture',
    } satisfies Record<RunningFeature, string>,
    hotkeyLabels: {
      region: 'Region Capture',
      fullscreen: 'Fullscreen Capture',
      window: 'Window Capture',
      delayedFullscreen: 'Delayed Fullscreen Capture (3s)',
      delayedRegion: 'Delayed Region Capture (3s)',
      disableClickThrough: 'Disable Click-Through',
      gif: 'GIF Recording',
      video: 'Screen Recording',
      clipboardPin: 'Clipboard Pin',
      ruler: 'Screen Ruler / Spacing',
      stepGuide: 'Step Guide Recording',
      scrollCapture: 'Scroll Capture',
      closeAllPins: 'Close All Pins',
      history: 'Capture History',
      openSettings: 'Open Settings',
      gifStudio: 'GIF Studio',
    } satisfies Record<HotkeyKey, string>,
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
    } satisfies Record<EditorTool, string>,
  },
});
