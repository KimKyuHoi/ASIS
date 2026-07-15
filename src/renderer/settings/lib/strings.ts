import { defineDict } from '../../../shared/i18n/language';

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
    recordingHint: '단축키 누르기…',
    reset: '기본값으로',
    save: '저장',
    saved: '저장됨 ✓',
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
    recordingHint: 'Press keys…',
    reset: 'Reset to Defaults',
    save: 'Save',
    saved: 'Saved ✓',
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
  },
});
