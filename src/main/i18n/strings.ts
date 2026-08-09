import { defineDict, getLanguage } from '../../shared/i18n/language';
import type { RunningFeature } from '../../shared/running-features';

/**
 * main process UI 문자열 사전.
 *
 * 사용법: `const t = tMain()` 를 *사용 시점* 에 읽는다 — 모듈 스코프에 상수로
 * 잡아두면 언어 변경이 반영되지 않는다. Tray/메뉴는 subscribeLanguage 구독으로
 * 언어 변경 시 재빌드된다 (index.ts). 싱글턴 윈도우 타이틀은 windowOptions 를
 * getter 로 두어 show() 시점의 언어를 읽는다 (onboardingWindow 참고).
 *
 * 보간이 필요한 값은 함수로 둔다: `saved: (path: string) => \`GIF 저장 — ${path}\``.
 * defineDict 가 ko/en 키·시그니처 일치를 컴파일 타임에 강제한다.
 */
export const mainStrings = defineDict({
  ko: {
    tray: {
      tooltip: 'ASIS — 캡처·어노테이션',
      fullscreen: '전체 화면 캡처',
      window: '윈도우 캡처',
      region: '영역 캡처',
      delayedFullscreen: '지연 전체화면 캡처 (3초)',
      delayedRegion: '지연 영역 캡처 (3초)',
      ocr: '텍스트 추출 (OCR)…',
      ruler: '화면 자 / 간격 측정…',
      scrollCapture: '스크롤 캡처…',
      video: '화면 녹화…',
      gif: 'GIF 녹화…',
      stepGuide: '스텝 가이드 녹화…',
      timeMachineStart: '타임머신 녹화 시작',
      timeMachineStop: '타임머신 녹화 정지',
      timeMachineSave: '타임머신 최근 구간 저장',
      /** 메뉴 안 비활성 헤더 — 메뉴를 열었을 때 현재 상태를 한 줄로 알려준다. */
      timeMachineStatusRecording: (bufferSeconds: number) =>
        `● 타임머신 녹화 중 · 최근 ${bufferSeconds}초 유지`,
      timeMachineStatusSaving: '⟳ 타임머신 구간 저장 중…',
      timeMachineStatusSaved: '✓ 타임머신 구간 저장됨',
      timeMachineStatusIdle: '○ 타임머신 꺼짐',
      /** 녹화 중 상태 헤더 — 알약이 안 보이는 전체화면 녹화에서 유일한 시각 단서. */
      recordingStatus: (feature: string) => `● ${feature} 진행 중`,
      videoStop: '화면 녹화 정지',
      gifStop: 'GIF 녹화 정지',
      stepGuideStop: '스텝 가이드 녹화 정지',
      scrollCaptureStop: '스크롤 캡처 정지',
      recordingNames: {
        timeMachine: '타임머신 녹화',
        gif: 'GIF 녹화',
        video: '화면 녹화',
        stepGuide: '스텝 가이드 녹화',
        scrollCapture: '스크롤 캡처',
      } as Record<RunningFeature, string>,
      clipboardPin: '클립보드를 핀으로',
      disableClickThrough: '모든 핀 click-through 해제',
      closeAllPins: '모든 핀 닫기',
      history: '캡처 히스토리',
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
    },
    app: {
      startFailedTitle: 'ASIS 시작 실패',
      updateComplete: (version: string) => `ASIS ${version} 업데이트 완료!`,
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
      disableClickThrough: (count: number) => `핀 ${count}개 click-through 해제`,
      closed: (count: number) => `핀 ${count}개 닫음`,
    },
    gif: {
      encoding: 'GIF 인코딩 중…',
      recording: 'GIF 녹화 중 — 단축키로 정지',
      saved: (path: string) => `GIF 저장 — ${path}`,
      encodeFailed: (message: string) => `GIF 인코딩 실패: ${message}`,
      recordFailed: (message: string) => `GIF 녹화 실패: ${message}`,
      startFailed: (message: string) => `GIF 시작 실패: ${message}`,
    },
    video: {
      stopping: '화면 녹화 정지 중…',
      recording: '화면 녹화 중 — 단축키로 정지',
      saved: (path: string) => `화면 녹화 저장 — ${path}`,
      failed: (message: string) => `화면 녹화 실패: ${message}`,
      startFailed: (message: string) => `화면 녹화 시작 실패: ${message}`,
    },
    ocr: {
      noText: '텍스트를 찾지 못했습니다',
      copied: '텍스트를 클립보드에 복사했습니다',
      failed: (message: string) => `텍스트 추출 실패: ${message}`,
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
      clickDetectionStopped: (detail: string) => `클릭 감지가 중단되었습니다: ${detail}`,
      empty: '기록된 클릭이 없습니다',
      saveDialogTitle: '가이드 저장',
      saved: (path: string) => `가이드 저장 — ${path}`,
      savedMarkdown: (path: string) =>
        `가이드 저장 — ${path}\n(이미지는 같은 폴더의 step-*.png — md만 옮기면 이미지가 안 보입니다)`,
      saveFailed: (message: string) => `가이드 저장 실패: ${message}`,
    },
    stepGuideDoc: {
      title: (count: number) => `ASIS 가이드 (${count}단계)`,
      captionGif: (order: number) => `${order}. 화면 동작 (GIF)`,
      captionLabel: (order: number, label: string) => `${order}. "${label}" 클릭`,
      captionPoint: (order: number, x: number, y: number) => `${order}. (${x}, ${y}) 위치 클릭`,
      metaLine: (date: string, count: number) => `생성: ${date} · 총 ${count}단계`,
      empty: '기록된 단계가 없습니다.',
      stepAlt: (order: number) => `단계 ${order}`,
    },
    timeMachine: {
      stopped: '타임머신 녹화를 정지했습니다 — 남아 있던 버퍼는 폐기됐습니다',
      stopFailed: (message: string) => `타임머신 정지 실패: ${message}`,
      started: (bufferSeconds: number) =>
        `타임머신 시작 — 최근 ${bufferSeconds}초 유지 중 (⌘⇧S로 저장)`,
      startFailed: (message: string) => `타임머신 시작 실패: ${message}`,
      notRunning: '타임머신이 실행 중이 아닙니다 (⌘⇧T로 시작)',
      empty: (bufferSeconds: number) =>
        `아직 저장할 구간이 없습니다 — 최소 몇 초는 녹화돼야 합니다 (버퍼 ${bufferSeconds}초)`,
      /** HUD 알약용 축약 — 알약 폭이 한 줄이라 짧게. */
      emptyShort: '아직 저장할 구간이 없습니다',
      drmWarning: (ymax: number) =>
        `저장된 화면이 검게 녹화되었습니다 — DRM/HDCP 보호 콘텐츠일 수 있습니다 (YMAX=${ymax})`,
      saved: (approxSeconds: number, fileName: string) =>
        `타임머신 저장 완료 — 최근 ${approxSeconds}초 · ${fileName} (클릭하면 폴더에서 보기)`,
      saveFailed: (message: string) => `타임머신 저장 실패: ${message}`,
      saveFailedShort: '저장 실패 — 알림을 확인해 주세요',
      copyFailed: (message: string) => `저장 폴더로 복사 실패: ${message}`,
      revealMissing: (fileName: string) =>
        `${fileName} 을(를) 찾을 수 없습니다 — 옮기거나 삭제된 것 같습니다`,
      diedUnexpectedly:
        '타임머신 녹화가 예기치 않게 종료됐습니다 — 화면 녹화 권한을 확인해 주세요',
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
  },
  en: {
    tray: {
      tooltip: 'ASIS — Capture & Annotate',
      fullscreen: 'Capture Full Screen',
      window: 'Capture Window',
      region: 'Capture Area',
      delayedFullscreen: 'Delayed Full Screen Capture (3s)',
      delayedRegion: 'Delayed Area Capture (3s)',
      ocr: 'Extract Text (OCR)…',
      ruler: 'Screen Ruler / Measure…',
      scrollCapture: 'Scrolling Capture…',
      video: 'Record Screen…',
      gif: 'Record GIF…',
      stepGuide: 'Record Step Guide…',
      timeMachineStart: 'Start Time Machine',
      timeMachineStop: 'Stop Time Machine',
      timeMachineSave: 'Save Recent Time Machine Clip',
      timeMachineStatusRecording: (bufferSeconds: number) =>
        `● Time Machine recording · last ${bufferSeconds}s buffered`,
      timeMachineStatusSaving: '⟳ Saving Time Machine clip…',
      timeMachineStatusSaved: '✓ Time Machine clip saved',
      timeMachineStatusIdle: '○ Time Machine off',
      recordingStatus: (feature: string) => `● ${feature} in progress`,
      videoStop: 'Stop Screen Recording',
      gifStop: 'Stop GIF Recording',
      stepGuideStop: 'Stop Step Guide Recording',
      scrollCaptureStop: 'Stop Scrolling Capture',
      recordingNames: {
        timeMachine: 'Time Machine recording',
        gif: 'GIF recording',
        video: 'Screen recording',
        stepGuide: 'Step Guide recording',
        scrollCapture: 'Scrolling capture',
      } as Record<RunningFeature, string>,
      clipboardPin: 'Pin Clipboard Image',
      disableClickThrough: 'Disable Click-Through on All Pins',
      closeAllPins: 'Close All Pins',
      history: 'Capture History',
      patchHistory: 'Release Notes…',
      settings: 'Settings…',
      permissions: 'Permissions…',
      quit: 'Quit',
    },
    menu: {
      view: 'View',
    },
    windows: {
      settingsTitle: 'ASIS Settings',
      onboardingTitle: 'ASIS',
      historyTitle: 'Capture History',
      patchHistoryTitle: 'Release Notes',
      editorTitle: 'ASIS — Annotate',
      editorSavedTitle: 'ASIS — Saved',
    },
    notify: {
      errorTitle: 'ASIS — Error',
    },
    app: {
      startFailedTitle: 'ASIS Failed to Start',
      updateComplete: (version: string) => `Updated to ASIS ${version}!`,
    },
    capture: {
      labelFullscreen: 'Full Screen Capture',
      labelWindow: 'Window Capture',
      labelRegion: 'Area Capture',
      saveFolderDialogTitle: 'Choose Save Folder',
      imageReadFailed: (label: string) => `${label} — couldn't read the captured image`,
      copiedToClipboard: (label: string) => `${label} — copied to clipboard`,
      editorFailed: (label: string, message: string) => `${label} editor failed: ${message}`,
      failed: (label: string, message: string) => `${label} failed: ${message}`,
      regionSelectFailed: (message: string) => `Area selection failed: ${message}`,
    },
    pin: {
      empty: 'No image in the clipboard',
      disableClickThrough: (count: number) => `Click-through disabled on ${count} pin(s)`,
      closed: (count: number) => `Closed ${count} pin(s)`,
    },
    gif: {
      encoding: 'Encoding GIF…',
      recording: 'Recording GIF — press the shortcut to stop',
      saved: (path: string) => `GIF saved — ${path}`,
      encodeFailed: (message: string) => `GIF encoding failed: ${message}`,
      recordFailed: (message: string) => `GIF recording failed: ${message}`,
      startFailed: (message: string) => `Couldn't start GIF recording: ${message}`,
    },
    video: {
      stopping: 'Stopping screen recording…',
      recording: 'Recording screen — press the shortcut to stop',
      saved: (path: string) => `Screen recording saved — ${path}`,
      failed: (message: string) => `Screen recording failed: ${message}`,
      startFailed: (message: string) => `Couldn't start screen recording: ${message}`,
    },
    ocr: {
      noText: 'No text found',
      copied: 'Text copied to clipboard',
      failed: (message: string) => `Text extraction failed: ${message}`,
    },
    scroll: {
      stopping: 'Stopping scrolling capture…',
      recording: 'Scrolling capture in progress — scroll slowly, then press the shortcut to stop',
      saved: (path: string) => `Scrolling capture saved — ${path}`,
      copied: 'Scrolling capture — copied to clipboard',
      failed: (message: string) => `Scrolling capture failed: ${message}`,
      startFailed: (message: string) => `Couldn't start scrolling capture: ${message}`,
      pngFilterName: 'PNG Image',
    },
    stepGuide: {
      needsAccessibility: 'Step Guide: Accessibility permission required',
      startFailed: (message: string) => `Couldn't start Step Guide: ${message}`,
      clickDetectionStopped: (detail: string) => `Click detection stopped: ${detail}`,
      empty: 'No clicks recorded',
      saveDialogTitle: 'Save Guide',
      saved: (path: string) => `Guide saved — ${path}`,
      savedMarkdown: (path: string) =>
        `Guide saved — ${path}\n(Images are step-*.png in the same folder — moving only the .md file will break them)`,
      saveFailed: (message: string) => `Failed to save guide: ${message}`,
    },
    stepGuideDoc: {
      title: (count: number) => `ASIS Guide (${count} steps)`,
      captionGif: (order: number) => `${order}. Screen action (GIF)`,
      captionLabel: (order: number, label: string) => `${order}. Click "${label}"`,
      captionPoint: (order: number, x: number, y: number) => `${order}. Click at (${x}, ${y})`,
      metaLine: (date: string, count: number) => `Created: ${date} · ${count} steps`,
      empty: 'No steps recorded.',
      stepAlt: (order: number) => `Step ${order}`,
    },
    timeMachine: {
      stopped: 'Time Machine stopped — the buffered clip was discarded',
      stopFailed: (message: string) => `Failed to stop Time Machine: ${message}`,
      started: (bufferSeconds: number) =>
        `Time Machine started — keeping the last ${bufferSeconds}s (⌘⇧S to save)`,
      startFailed: (message: string) => `Failed to start Time Machine: ${message}`,
      notRunning: "Time Machine isn't running (⌘⇧T to start)",
      empty: (bufferSeconds: number) =>
        `Nothing to save yet — a few seconds must be recorded first (buffer ${bufferSeconds}s)`,
      emptyShort: 'Nothing to save yet',
      drmWarning: (ymax: number) =>
        `The saved video came out black — it may be DRM/HDCP-protected content (YMAX=${ymax})`,
      saved: (approxSeconds: number, fileName: string) =>
        `Time Machine saved — last ${approxSeconds}s · ${fileName} (click to reveal in Finder)`,
      saveFailed: (message: string) => `Failed to save Time Machine clip: ${message}`,
      saveFailedShort: 'Save failed — see the notification',
      copyFailed: (message: string) => `Failed to copy into the save folder: ${message}`,
      revealMissing: (fileName: string) =>
        `Couldn't find ${fileName} — it may have been moved or deleted`,
      diedUnexpectedly:
        'Time Machine recording exited unexpectedly — check Screen Recording permission',
    },
    permissions: {
      launchDeniedTitle: 'ASIS — Screen Recording Denied',
      launchInfoTitle: 'ASIS — Permissions',
      launchDeniedMessage: 'Screen Recording permission is denied',
      launchInfoMessage: 'Screen Recording permission required',
      launchDeniedDetail:
        'ASIS needs Screen Recording permission to capture your screen.\n\nOpen System Settings → Privacy & Security → Screen Recording, enable ASIS, then restart the app.',
      launchInfoDetail:
        'ASIS uses Screen Recording permission to capture your screen.\n\nmacOS will ask for permission the first time you capture — just click "Allow".\n\nYou can also grant it now in System Settings.',
      guardDeniedDetail:
        'Open System Settings → Privacy & Security → Screen Recording, enable ASIS, then restart the app.',
      openSettingsButton: 'Open System Settings',
      laterButton: 'Later',
      confirmButton: 'OK',
      closeButton: 'Close',
    },
    updater: {
      title: (version: string) => `ASIS ${version} Update`,
      message: (version: string) => `ASIS ${version} is ready to install.`,
      detail: 'Install now?\nThe app will restart automatically after installing.',
      installNowButton: 'Install Now',
      laterButton: 'Later',
    },
    accessibility: {
      title: 'ASIS — Accessibility Permission Required',
      rulerBody: 'Enable ASIS in System Settings to measure element dimensions.',
      selectionBody:
        'Enable ASIS in System Settings and restart the app to auto-detect UI elements.',
    },
  },
});

/** 현재 언어의 main 문자열 — 반드시 사용 시점에 호출한다. */
export function tMain(): (typeof mainStrings)['ko'] {
  return mainStrings[getLanguage()];
}
