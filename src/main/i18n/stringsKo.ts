import type { RunningFeature } from '../../shared/running-features';
import type { HotkeyKey } from '../shortcuts';

/** main process UI 문자열 — 한국어. 기준 스키마다 (en 은 이 형태를 그대로 따라야 한다). */
export const ko = {
  tray: {
    tooltip: 'ASIS — 캡처·어노테이션',
    fullscreen: '전체 화면 캡처',
    window: '윈도우 캡처',
    region: '영역 캡처',
    delayedFullscreen: '지연 전체화면 캡처 (3초)',
    delayedRegion: '지연 영역 캡처 (3초)',
    ruler: '화면 자 / 간격 측정…',
    scrollCapture: '스크롤 캡처…',
    video: '화면 녹화…',
    gif: 'GIF 녹화…',
    stepGuide: '스텝 가이드 녹화…',
    /** 녹화 중 상태 헤더 — 알약이 안 보이는 전체화면 녹화에서 유일한 시각 단서. */
    recordingStatus: (feature: string) => `● ${feature} 진행 중`,
    videoStop: '화면 녹화 정지',
    gifStop: 'GIF 녹화 정지',
    gifStudio: 'GIF 스튜디오…',
    imageStudio: '이미지 스튜디오…',
    stepGuideStop: '스텝 가이드 녹화 정지',
    scrollCaptureStop: '스크롤 캡처 정지',
    recordingNames: {
      gif: 'GIF 녹화',
      video: '화면 녹화',
      stepGuide: '스텝 가이드 녹화',
      scrollCapture: '스크롤 캡처',
    } satisfies Record<RunningFeature, string>,
    clipboardPin: '클립보드를 핀으로',
    disableClickThrough: '모든 핀 클릭 통과 해제',
    disableClickThroughCount: (count: number) => `고정된 핀 ${count}개 클릭 통과 해제`,
    closeAllPins: '모든 핀 닫기',
    history: '캡처 히스토리',
    restoreHidden: (count: number) => `숨긴 창 다시 보기 (${count})`,
    restoreHiddenNone: '숨긴 창 없음',
    patchHistory: '변경 이력…',
    settings: '환경설정…',
    permissions: '권한 설정…',
    quit: '종료',
  },
  menu: {
    view: '보기',
  },
  windows: {
    settingsTitle: 'ASIS 환경설정',
    onboardingTitle: 'ASIS',
    historyTitle: '캡처 히스토리',
    patchHistoryTitle: '변경 이력',
    editorTitle: 'ASIS — 어노테이션',
    editorSavedTitle: 'ASIS — 저장 완료',
  },
  notify: {
    errorTitle: 'ASIS — 오류',
    unknownError: '알 수 없는 오류가 발생했습니다. 자세한 내용은 로그를 확인해 주세요.',
  },
  app: {
    startFailedTitle: 'ASIS 시작 실패',
    updateComplete: (version: string) => `ASIS ${version} 업데이트 완료!`,
  },
  shortcuts: {
    names: {
      region: '영역 캡처',
      fullscreen: '전체 화면 캡처',
      window: '윈도우 캡처',
      delayedFullscreen: '지연 전체화면 캡처',
      delayedRegion: '지연 영역 캡처',
      disableClickThrough: '핀 클릭 통과 해제',
      gif: 'GIF 녹화',
      video: '화면 녹화',
      clipboardPin: '클립보드를 핀으로',
      ruler: '화면 자',
      stepGuide: '스텝 가이드 녹화',
      scrollCapture: '스크롤 캡처',
      closeAllPins: '모든 핀 닫기',
      history: '캡처 히스토리',
      openSettings: '환경설정',
      gifStudio: 'GIF 스튜디오',
    } satisfies Record<HotkeyKey, string>,
    invalidRepaired: (name: string) =>
      `${name} — 저장된 단축키 값이 손상되어 해제했습니다. 환경설정에서 다시 지정해 주세요.`,
    taken: (name: string, accelerator: string) =>
      `${name} (${accelerator}) — 다른 앱이 이미 사용 중인 단축키라 등록하지 못했습니다.`,
    someFailed: (lines: string[]) => `일부 단축키를 등록하지 못했습니다.\n${lines.join('\n')}`,
    startFailed: (message: string) =>
      `단축키 등록에 실패했습니다: ${message}\n트레이 메뉴로는 계속 사용할 수 있습니다.`,
  },
  capture: {
    labelFullscreen: '전체화면 캡처',
    labelWindow: '윈도우 캡처',
    labelRegion: '영역 캡처',
    saveFolderDialogTitle: '저장 폴더 선택',
    imageReadFailed: (label: string) => `${label} — 캡처 이미지를 읽지 못했습니다`,
    copiedToClipboard: (label: string) => `${label} — 클립보드에 복사되었습니다`,
    editorFailed: (label: string, message: string) => `${label} 에디터 실패: ${message}`,
    failed: (label: string, message: string) => `${label} 실패: ${message}`,
    regionSelectFailed: (message: string) => `영역 선택 실패: ${message}`,
  },
  pin: {
    empty: '클립보드에 이미지가 없습니다',
    disableClickThrough: (count: number) => `핀 ${count}개 클릭 통과 해제`,
    closed: (count: number) => `핀 ${count}개 닫음`,
  },
  recording: {
    /** 녹화끼리는 동시에 돌지 않는다 — 진행 중인 기능 이름을 알려 준다. */
    busy: (names: string) => `${names} 진행 중입니다 — 먼저 정지한 뒤 다시 시작해 주세요`,
    selecting: '영역을 선택하는 중입니다 — 선택을 마치거나 ESC로 취소한 뒤 다시 시작해 주세요',
  },
  gif: {
    encoding: 'GIF 인코딩 중…',
    recording: 'GIF 녹화 중 — 단축키로 정지',
    saved: (path: string) => `GIF 저장 — ${path}`,
    copied: 'GIF 녹화 — 클립보드에 복사했습니다',
    encodeFailed: (message: string) => `GIF 인코딩 실패: ${message}`,
    recordFailed: (message: string) => `GIF 녹화 실패: ${message}`,
    startFailed: (message: string) => `GIF 시작 실패: ${message}`,
  },
  gifStudio: {
    openFailed: (message: string) => `GIF 스튜디오를 열지 못했습니다: ${message}`,
  },
  editorQueue: {
    /** 편집 중에 들어온 열기 요청(히스토리 [편집]·이미지 스튜디오·Finder) — 지금 편집이 끝나면 연다. */
    waiting: (count: number) => `편집 중인 이미지가 있어 끝나면 이어서 엽니다 (대기 ${count}개)`,
  },
  editorProject: {
    /** 복사 알림의 출처 라벨 — capture.copiedToClipboard(label) */
    label: '편집본',
    openFailed: (message: string) => `편집본을 열지 못했습니다: ${message}`,
  },
  imageStudio: {
    /** 복사 알림의 출처 라벨 — capture.copiedToClipboard(label) */
    label: '이미지 스튜디오',
    openDialogTitle: '이미지 스튜디오에서 열 이미지',
    fileTypeName: '이미지',
    openFailed: (message: string) => `이미지를 열지 못했습니다: ${message}`,
    readFailed: '파일을 읽지 못했습니다.',
    unsupported: '지원하지 않는 이미지 형식이거나 손상된 파일입니다.',
    tooLarge: '이미지가 너무 큽니다 (최대 200MB, 한 변 16384px).',
  },
  video: {
    stopping: '화면 녹화 정지 중…',
    recording: '화면 녹화 중 — 단축키로 정지',
    saved: (path: string) => `화면 녹화 저장 — ${path}`,
    failed: (message: string) => `화면 녹화 실패: ${message}`,
    startFailed: (message: string) => `화면 녹화 시작 실패: ${message}`,
    errors: {
      exitedEarly: '녹화가 시작 직후 종료됐습니다. 화면 녹화 권한을 확인해 주세요.',
      stopTimeout: '녹화를 정지하지 못했습니다(응답 없음).',
      emptyFile: '녹화 파일이 비어 있습니다.',
      verifyFailed: '녹화 파일을 확인하지 못했습니다.',
      noDisplay: '선택한 영역이 있는 화면을 찾지 못했습니다.',
      noScreenInput: '이 화면은 녹화 장치 목록에 없습니다. 디스플레이를 다시 연결한 뒤 시도해 주세요.',
      saveFailed: (tempPath: string) =>
        `녹화 파일을 저장하지 못했습니다. 원본은 여기에 남아 있습니다: ${tempPath}`,
    },
  },
  scroll: {
    stopping: '스크롤 캡처 정지 중…',
    recording: '스크롤 캡처 중 — 천천히 스크롤 후 단축키로 정지',
    saved: (path: string) => `스크롤 캡처 저장 — ${path}`,
    copied: '스크롤 캡처 — 클립보드에 복사되었습니다',
    failed: (message: string) => `스크롤 캡처 실패: ${message}`,
    startFailed: (message: string) => `스크롤 캡처 시작 실패: ${message}`,
    pngFilterName: 'PNG 이미지',
  },
  stepGuide: {
    needsAccessibility: '스텝 가이드: 손쉬운 사용 권한이 필요합니다',
    startFailed: (message: string) => `스텝 가이드 시작 실패: ${message}`,
    empty: '기록된 클릭이 없습니다',
    saveDialogTitle: '가이드 저장',
    saved: (path: string) => `가이드 저장 — ${path}`,
    saveFailed: (message: string) => `가이드 저장 실패: ${message}`,
  },
  releaseNotice: {
    title: (version: string) => `ASIS ${version}(으)로 업데이트했습니다`,
    body: '새 기능과 바뀐 점을 공지에서 확인해 보세요.',
    open: '공지 보기',
    later: '나중에',
  },
  permissions: {
    launchDeniedTitle: 'ASIS — 화면 녹화 권한 없음',
    launchInfoTitle: 'ASIS — 권한 안내',
    launchDeniedMessage: '화면 녹화 권한이 거부되어 있습니다',
    launchInfoMessage: '화면 녹화 권한이 필요합니다',
    launchDeniedDetail:
      'ASIS의 캡처 기능을 사용하려면 화면 녹화 권한이 필요합니다.\n\n시스템 설정 → 개인정보 보호 및 보안 → 화면 녹화에서 ASIS를 켠 뒤 앱을 재시작해 주세요.',
    launchInfoDetail:
      'ASIS는 캡처 기능을 위해 화면 녹화 권한을 사용합니다.\n\n처음 캡처를 시도하면 macOS가 권한을 요청합니다. "허용"을 눌러주세요.\n\n지금 시스템 설정에서 미리 허용할 수도 있습니다.',
    guardDeniedDetail:
      '시스템 설정 → 개인정보 보호 및 보안 → 화면 녹화에서 ASIS를 활성화한 뒤 재시작해 주세요.',
    openSettingsButton: '시스템 설정 열기',
    laterButton: '나중에',
    confirmButton: '확인',
    closeButton: '닫기',
  },
  updater: {
    title: (version: string) => `ASIS ${version} 업데이트`,
    message: (version: string) => `ASIS ${version} 업데이트가 준비되었습니다.`,
    detail: '지금 설치하시겠어요?\n설치 후 자동으로 재시작됩니다.',
    installNowButton: '지금 설치',
    laterButton: '나중에',
  },
  accessibility: {
    title: 'ASIS — 손쉬운 사용 권한 필요',
    rulerBody: '시스템 설정에서 ASIS를 허용하면 요소 치수 측정이 활성화됩니다.',
    selectionBody: '시스템 설정에서 ASIS를 허용한 후 앱을 재시작하면 UI 자동감지가 활성화됩니다.',
  },
};

export type MainStrings = typeof ko;
