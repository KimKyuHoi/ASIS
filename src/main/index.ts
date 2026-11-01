import { app, nativeTheme } from 'electron';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import log from 'electron-log/main';
import { installAppMenu } from './menu';
import { loadMisc } from './settings';
import { warmScreencapture } from './capture/capture';
import { warmDisplaySnapshot } from './capture/displaySnapshot';
import { checkPermissionsOnLaunch } from './permissions';
import { setupAutoUpdater } from './updateChecker';
import { initLanguage, isLanguageChosen } from './i18n/i18n';
import { subscribeLanguage } from '../shared/i18n/language';
import {
  editorWindow,
  onboardingWindow,
  selectionOverlay,
  stopAllManagers,
  trayManager,
} from './app/managers';
import { registerIpcHandlers } from './app/ipcHandlers';
import { flushPendingOpenFiles, registerOpenFileHandler } from './app/fileOpen';
import { announceReleaseNotes, registerOnboardingDone } from './app/releaseNotice';
import {
  applyMacIntegration,
  checkVersionOnLaunch,
  instanceLockReady,
  registerQuitHandlers,
  reportStartupFailure,
  startTrayAndShortcuts,
} from './app/startup';

/**
 * ASIS — macOS 메뉴바 캡처·어노테이션 도구. main process 진입점.
 *
 * 이 파일은 순서만 정한다 — 매니저(app/managers), 캡처·녹화 흐름(app/captureFlows·recordingFlows),
 * 파일 열기(app/fileOpen), IPC(app/ipcHandlers), 시작·종료(app/startup) 는 각 모듈에 있다.
 *
 * 룰 적용
 *   - side-effects.md — Tray/Shortcut/SelectionOverlay/EditorWindow 모두 Class.
 *   - null-safety.md — 캡처/에디터 에러 모두 명시 처리, 사용자 취소는 silent.
 *   - imperative-style.md — main process 전반 명령형 OK.
 */

// whenReady 를 기다릴 필요가 없는 등록 — open-file 은 앱을 실행시킨 Finder '열기' 도 받아야 한다.
registerIpcHandlers();
registerOnboardingDone();
registerOpenFileHandler();
registerQuitHandlers();

// fullscreen Space 호환성 — macOS 의 regular 앱은 자체 Space 컨텍스트를 가져서
// `makeKeyAndOrderFront:` → NSApp 활성화 → macOS 가 ASIS Space 로 강제 전환된다.
// accessory 앱은 Space 컨텍스트가 없어 이 전환이 원천 차단된다.
// `whenReady` *이전* 에 호출 = initial 설정 → macOS 26β 의 dynamic LSUIElement
// 전환 시 키보드 포커스 영구 차단 회귀를 회피.
// app.dock.hide() 같은 동적 전환은 절대 호출하지 않는다.
if (process.platform === 'darwin') {
  app.setActivationPolicy('accessory');
  if (is.dev) console.info('[asis] app.setActivationPolicy("accessory") applied');
}

// electron-updater 이벤트 리스너를 app.whenReady 이전에 등록.
// stopAllManagers 주입 — 설치 직전 prewarm 재생성 차단 + 창 정리용.
setupAutoUpdater(stopAllManagers);

/** 언어·메뉴 — 첫 BrowserWindow(prewarm 포함)·메뉴 설치보다 반드시 먼저 실행한다. */
function initLanguageAndMenu(): void {
  // preload sendSync 와 메뉴 라벨이 올바른 언어를 보도록 언어 로드 + i18n IPC 등록이 먼저.
  initLanguage();
  // 언어 변경 → 트레이 툴팁·컨텍스트 메뉴와 앱 메뉴 재빌드. 앱 수명 구독.
  subscribeLanguage(() => {
    trayManager.refresh();
    installAppMenu();
  });
  // 기본 메뉴의 zoom accelerator(Cmd +/-/0)가 에디터 줌 단축키를 가로채는 것을 막는다.
  installAppMenu();
}

/**
 * prewarm — 앱 시작 직후 단축키를 눌렀을 때 renderer 로드가 끝나 있을 확률을 높인다.
 * 단축키 임계 경로인 selection 을 editor(번들이 훨씬 큼)보다 먼저 로드해 IO 경합에서 우선권을 준다.
 */
function prewarm(): void {
  selectionOverlay.prewarm();
  editorWindow.prewarm();
  // screencapture 첫 spawn 의 SCK/TCC 초기화 콜드스타트(실측 629ms)를 미리 치러
  // 둔다 — 첫 실제 캡처가 warm 속도(~110ms)로 시작한다.
  warmScreencapture();
  // CG background 캡처 경로도 동일하게 warm-up (첫 호출 ~80ms → 이후 ~20ms).
  warmDisplaySnapshot();
}

app.whenReady().then(async () => {
  // 단일 인스턴스 잠금을 얻지 못했으면(중복 실행) 트레이·단축키를 만들지 않고 종료를 기다린다.
  if (!(await instanceLockReady)) return;
  // [perf] 콜드스타트 진단 — 프로세스 시작 → whenReady 까지 걸린 시간.
  log.info(`[perf] whenReady +${Math.round(process.uptime() * 1000)}ms`);

  electronApp.setAppUserModelId('com.pinkfong.asis');
  nativeTheme.themeSource = loadMisc().appearance;
  initLanguageAndMenu();
  flushPendingOpenFiles();
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  prewarm();

  const showReleaseNotes = checkVersionOnLaunch();
  applyMacIntegration();
  startTrayAndShortcuts();

  // 첫 실행(언어 미선택) — 언어 선택 창을 띄운다. 이후 실행에는 나타나지 않는다.
  if (!isLanguageChosen()) onboardingWindow.show();
  // 새 버전 첫 실행 — 업데이트 공지 알림(온보딩 중이면 그 뒤로).
  announceReleaseNotes(showReleaseNotes);

  // 앱 시작 직후 권한 상태 확인 — 거부/미설정 시 안내 다이얼로그 표시.
  checkPermissionsOnLaunch().catch((err: unknown) => {
    console.error('[asis] permission check failed', err);
  });
}).catch(reportStartupFailure);
