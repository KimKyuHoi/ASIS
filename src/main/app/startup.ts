import { app, dialog, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import log from 'electron-log/main';
import devAppIconPath from '../../../resources/icon.png?asset';
import { loadMisc, settingsStore } from '../settings';
import { checkForUpdates, isNewer, isQuittingForUpdate } from '../updateChecker';
import { resolveStartupReleaseNotes } from '../patch-notes/startupAnnounce';
import { hiddenWindows } from '../windows/hiddenWindows';
import { userMessageOf } from '../userFacingError';
import { tMain } from '../i18n/strings';
import {
  pinWindow,
  runningFeatures,
  shortcutManager,
  stepGuideWindow,
  stopAllManagers,
  trayManager,
} from './managers';
import { createMenuHandlers } from './trayHandlers';
import { notifyError, notifyInfo } from './notify';

/**
 * 앱 시작·종료 배선 — 단일 인스턴스, 버전·업데이트 확인, 로그인 항목, 트레이·단축키, 종료 처리.
 */

// 단일 인스턴스 보장.
// dev(`electron-vite dev --watch`) 는 main 이 바뀔 때마다 앱을 재시작하는데, 저장이 연달아 오면
// 이전 프로세스가 아직 잠금을 쥔 채 종료 중일 때 새 프로세스가 뜬다. 바로 quit 하면
// electron-vite 가 "앱이 스스로 종료됨" 으로 보고 dev 전체를 내린다(21:20·22:30 실측).
// 그래서 dev 에서는 잠금을 잠깐 재시도한다 — 그 안에 풀리면 재시작 경합이고, 계속 안 풀리면
// 진짜 중복 실행(dev 를 두 번 띄움)이라 종료한다(잠금 없이 계속하면 트레이·단축키가 두 벌이 된다).
const DEV_LOCK_WAIT_MS = 3000;
const DEV_LOCK_POLL_MS = 150;

function acquireInstanceLock(): Promise<boolean> {
  if (app.requestSingleInstanceLock()) return Promise.resolve(true);
  if (app.isPackaged) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const got = app.requestSingleInstanceLock();
      if (!got && Date.now() - startedAt < DEV_LOCK_WAIT_MS) return;
      clearInterval(timer);
      resolve(got);
    }, DEV_LOCK_POLL_MS);
  });
}

/** 잠금을 얻으면 true. 못 얻으면(중복 실행) 종료를 요청하고 false. */
export const instanceLockReady = acquireInstanceLock().then((got) => {
  if (!got) {
    if (!app.isPackaged) log.warn('[app] dev: 다른 인스턴스가 이미 실행 중 — 이 인스턴스를 종료');
    app.quit();
  }
  return got;
});

/**
 * 버전 확인 — 업데이트 완료 알림, 새 버전 공지 판정, 업데이트 체크 예약.
 * @returns 새 버전 공지를 띄울지
 */
export function checkVersionOnLaunch(): boolean {
  // 업데이트 완료 감지 — lastLaunchedVersion 이 현재보다 낮으면 방금 업데이트된 것.
  const current = app.getVersion();
  const lastVersion = settingsStore.get('lastLaunchedVersion');
  // lastVersion 이 '' (기본값) 인 경우도 포함 — isNewer 는 '' 을 '0.0.0' 으로 처리한다.
  if (isNewer(current, lastVersion)) notifyInfo(tMain().app.updateComplete(current));
  // 새 버전 공지 판정 — 첫 설치 여부는 lastLaunchedVersion 을 덮어쓰기 *전* 값으로 본다.
  const releaseNotes = resolveStartupReleaseNotes(lastVersion);
  settingsStore.set('lastLaunchedVersion', current);

  // 업데이트 체크 — 앱 시작 5초 후 첫 체크, 이후 3일마다 반복.
  // electron-updater 가 백그라운드 다운로드 → 완료 후 설치 확인 다이얼로그를 처리한다.
  // 트레이·단축키 초기화보다 *먼저* 예약한다 — 그쪽에서 예외가 나더라도 자동 업데이트
  // 경로는 살아 있어야 고장난 버전에서 빠져나올 수 있다 (v0.7.2 시작 실패 교훈).
  const CHECK_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3일
  setTimeout(() => checkForUpdates(), 5000);
  setInterval(() => checkForUpdates(), CHECK_INTERVAL_MS);
  return releaseNotes.show;
}

/**
 * 로그인 항목 재단언 + Dock 아이콘. 과거 dev 실행이나 옛 번들이 잘못된 경로로 로그인 항목을
 * 등록했거나 등록이 유실된 경우를 저장된 설정 기준으로 복구한다.
 * status: not-registered | enabled | requires-approval | not-found (macOS 13+).
 * https://www.electronjs.org/docs/latest/api/app (getLoginItemSettings)
 */
export function applyMacIntegration(): void {
  if (process.platform !== 'darwin') return;
  if (app.isPackaged) {
    const wanted = loadMisc().openAtLogin;
    const loginItem = app.getLoginItemSettings();
    log.info('[loginItem]', { wanted, registered: loginItem.openAtLogin, status: loginItem.status });
    if (loginItem.openAtLogin !== wanted) app.setLoginItemSettings({ openAtLogin: wanted });
  }
  // macOS 26 β 에서 app.dock.hide() 는 모든 자식 윈도우의 키보드 focus 를 영구 차단하는 회귀가
  // 있어 호출하지 않는다 — accessory 정책으로 Dock 아이콘은 보이지 않고, 아이콘만 지정해 둔다.
  if (app.dock) {
    const prodPath = join(process.resourcesPath, 'icon.png');
    const iconPath = existsSync(prodPath) ? prodPath : devAppIconPath;
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }
}

/** 트레이·전역 단축키 시작. 단축키 실패는 앱 시작을 막지 않는다(트레이 메뉴로 대체 가능). */
export function startTrayAndShortcuts(): void {
  const handlers = createMenuHandlers();
  trayManager.start(handlers, {
    activeRecording: () => runningFeatures()[0] ?? null,
    pinClickThroughCount: () => pinWindow.clickThroughCount(),
    hiddenWindowCount: () => hiddenWindows.count(),
  });
  hiddenWindows.setChangeListener(() => trayManager.refresh());
  // 스텝 가이드는 show() 가 void 라 종료 시점을 Promise 로 못 받는다 — 콜백으로 통지받아
  // 메뉴바 인디케이터를 내린다 (GIF·영상·스크롤 캡처는 show() 의 finally 에서 처리).
  stepGuideWindow.onActiveChange = (): void => trayManager.refresh();

  // 단축키 등록 실패(손상된 저장값·다른 앱 선점)는 항목별로 알리고 나머지는 계속 등록한다.
  // 손상값은 ShortcutManager 가 '해제' 로 복구해 저장하므로 설정 창에도 그대로 반영된다.
  shortcutManager.onFailures = (failures): void => {
    log.warn('[shortcuts] registration failures', failures);
    const t = tMain().shortcuts;
    const lines = failures.map((f) =>
      f.kind === 'invalid' ? t.invalidRepaired(t.names[f.key]) : t.taken(t.names[f.key], f.accelerator),
    );
    notifyError(t.someFailed(lines));
    // 해제로 복구된 항목의 accelerator 표기를 트레이 메뉴에서도 지운다.
    trayManager.refresh();
  };
  try {
    shortcutManager.start(handlers);
  } catch (err: unknown) {
    log.error('[shortcuts] start failed', err);
    notifyError(tMain().shortcuts.startFailed(userMessageOf(err)));
  }
}

/** app.whenReady 체인의 미처리 에러가 조용히 삼켜지는 걸 방지. */
export function reportStartupFailure(err: unknown): void {
  console.error('[asis] app initialization failed', err);
  const message = err instanceof Error ? err.message : String(err);
  dialog.showErrorBox(tMain().app.startFailedTitle, message);
}

/** 모든 창이 닫혔을 때·종료 직전 처리. */
export function registerQuitHandlers(): void {
  app.on('window-all-closed', () => {
    // macOS 는 트레이 앱이라 모든 창이 닫혀도 평소엔 종료하지 않는다.
    // 단, 자동 업데이트 설치(quitAndInstall) 중에는 반드시 종료해야 Squirrel.Mac 의
    // ShipIt 이 번들 교체를 진행한다. quitAndInstall 경로는 before-quit 을 정상 순서로
    // 발생시키지 않으므로 여기서 플래그를 직접 확인한다. → electron/electron#15453
    if (process.platform !== 'darwin' || isQuittingForUpdate()) app.quit();
  });

  app.on('before-quit', (event) => {
    log.info('[app] before-quit', { quittingForUpdate: isQuittingForUpdate() });
    // 스텝 가이드 편집 창은 저장 전 녹화 결과를 메모리에만 들고 있다 — 업데이트 설치가 아니면
    // 먼저 닫기 확인(미저장이면 "저장하지 않고 닫기")을 거치고, 사용자가 취소하면 종료를 멈춘다.
    // 업데이트 설치 경로는 기존처럼 강제 종료를 유지한다.
    if (!isQuittingForUpdate() && stepGuideWindow.hasOpenEditors()) {
      event.preventDefault();
      // 노란 버튼으로 숨긴 편집 창은 closeEditorsForQuit 이 확인 시트 전에 직접 꺼낸다 —
      // 여기서 restoreAll 을 부르면 숨겨 둔 에디터·GIF 스튜디오 창까지 모두 다시 나타난다.
      stepGuideWindow
        .closeEditorsForQuit()
        .then((closed) => {
          if (closed) app.quit();
        })
        .catch((err: unknown) => {
          // 정리 실패 시 종료가 조용히 멈추지 않도록 사용자에게 알린다(재시도는 사용자 몫).
          log.error('[app] 스텝 가이드 편집 창 정리 실패', err);
          notifyError(userMessageOf(err));
        });
      return;
    }
    stopAllManagers();
  });
}
