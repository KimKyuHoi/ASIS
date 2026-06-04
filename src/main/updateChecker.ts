import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow, dialog, autoUpdater as nativeUpdater } from 'electron';
import log from 'electron-log/main';

/** semver 비교 — latest 가 current 보다 크면 true. */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

// quitAndInstall() 직후 트레이 앱이 종료되지 않는 문제 대응 플래그.
// 네이티브 quitAndInstall 은 "모든 창 닫기 → 모든 창이 닫힌 뒤 app.quit()" 으로
// 동작한다 (https://www.electronjs.org/docs/latest/api/auto-updater). macOS 에서
// window-all-closed 가 quit 을 막으면(트레이 앱 패턴) 앱이 살아남아 Squirrel.Mac 의
// ShipIt 이 번들 교체를 못 하고 무한 대기한다. 그래서 설치 시 이 플래그를 세우고,
// window-all-closed 에서 확인해 macOS 에서도 app.quit() 을 강제한다.
// 출처: https://github.com/electron/electron/issues/15453 (Electron 메인테이너 권장)
let quittingForUpdate = false;

export function isQuittingForUpdate(): boolean {
  return quittingForUpdate;
}

// 백스톱 타이머 — 정상 경로(Squirrel 로컬 프록시 다운로드 ~수 초)면 그 전에
// 프로세스가 끝난다. 다운로드 실패 등으로 before-quit-for-update 가 오지 않는
// 경로에서만 발동해, 0.4.5 에서 관측된 "설치 대기 중 19분 미종료" 재발을 막는다.
const QUIT_FALLBACK_MS = 15_000;

/**
 * @param prepareQuitForUpdate 모든 윈도우 매니저 stop — stopped 플래그를 세워
 *   prewarm 의 closed→재생성 재귀를 차단한다 (index.ts 의 stopAllManagers).
 */
export function setupAutoUpdater(prepareQuitForUpdate: () => void): void {
  // electron-updater 내부 로그(quitAndInstall / proxy server / nativeUpdater 이벤트)를
  // 파일로 남긴다 — 프로덕션에서 업데이트 실패 원인을 사후 확인하기 위함.
  // 로그 경로(macOS): ~/Library/Logs/ASIS/main.log
  autoUpdater.logger = log;
  log.transports.file.level = 'info';

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  // 설치 직전 강제 정리 — 매니저 stop(prewarm 재생성 차단) 후 남은 창 전부 destroy.
  // close() 가 아닌 destroy() 인 이유: renderer 의 unload 를 기다리지 않아 종료가
  // 빠르다. ShipIt 은 앱 종료가 늦으면 "App Still Running Error" (SQRLInstallerError
  // Code=-9) 로 설치를 취소한다 — 0.4.5→0.4.6 설치 실패에서 실제 관측됨.
  // destroy() 는 close 이벤트 없이 closed 이벤트만 보장 emit 하므로
  // (https://www.electronjs.org/docs/latest/api/browser-window) 매니저들의
  // closed 핸들러 정리 로직은 그대로 동작한다.
  let cleanedUpForInstall = false;
  const cleanupForInstall = (): void => {
    if (cleanedUpForInstall) return;
    cleanedUpForInstall = true;
    prepareQuitForUpdate();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.destroy();
    }
  };

  // 네이티브 quitAndInstall 은 "모든 창이 닫힌 뒤" app.quit() 을 부른다. 그런데
  // editor/selection 의 prewarm 매니저는 closed 시 창을 재생성하므로 "모든 창 닫힘"
  // 에 영영 도달하지 못해 앱이 멈춘다 (0.4.5 에서 19분 미종료 관측 — main.log
  // 09:04 quitAndInstall → 09:23 before-quit). 네이티브 updater 가 quitAndInstall
  // 직후 emit 하는 before-quit-for-update 에서 먼저 정리해 종료를 보장한다.
  // 주의: 이 이벤트는 app 이 아니라 *네이티브 autoUpdater* 의 이벤트다.
  // https://www.electronjs.org/docs/latest/api/auto-updater
  nativeUpdater.on('before-quit-for-update', () => {
    log.info('[updater] before-quit-for-update — 매니저 정리 + 창 destroy');
    cleanupForInstall();
  });

  autoUpdater.on('checking-for-update', () => log.info('[updater] checking for update'));
  autoUpdater.on('update-available', (info) =>
    log.info('[updater] update available', info.version),
  );
  autoUpdater.on('update-not-available', () => log.info('[updater] update not available'));
  autoUpdater.on('download-progress', (p) =>
    log.info(`[updater] downloading ${Math.round(p.percent)}%`),
  );

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[updater] update downloaded', info.version);
    dialog
      .showMessageBox({
        type: 'info',
        title: `ASIS ${info.version} 업데이트`,
        message: `ASIS ${info.version} 업데이트가 준비되었습니다.`,
        detail: '지금 설치하시겠어요?\n설치 후 자동으로 재시작됩니다.',
        buttons: ['지금 설치', '나중에'],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          // window-all-closed 가 macOS 종료를 막지 않도록 플래그를 먼저 세운다.
          quittingForUpdate = true;
          log.info('[updater] quitAndInstall 호출 — 종료 후 설치');
          autoUpdater.quitAndInstall();
          // 백스톱 — before-quit-for-update 가 오지 않는 실패 경로에서도 앱이
          // 좀비로 남지 않게 강제 정리 후 종료. 정상 설치 경로면 타이머가 돌기
          // 전에 프로세스가 끝나므로 발동하지 않는다.
          setTimeout(() => {
            log.warn('[updater] 종료 백스톱 발동 — 강제 정리 후 app.quit()');
            cleanupForInstall();
            app.quit();
          }, QUIT_FALLBACK_MS);
        }
      })
      .catch((err) => {
        // 다이얼로그 표시/응답 실패 — 다음 실행 시 재시도되므로 치명적이지 않다.
        log.warn('[updater] 업데이트 다이얼로그 실패', err);
      });
  });

  autoUpdater.on('error', (err) => {
    log.error('[updater] auto-updater error', err);
  });
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err) => {
    log.warn('[updater] update check failed', err);
  });
}
