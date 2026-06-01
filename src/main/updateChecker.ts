import { autoUpdater } from 'electron-updater';
import { dialog } from 'electron';
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
// quitAndInstall 은 "모든 창 닫기 → app.quit()" 순으로 동작하지만, 이 경로에서는
// before-quit 이 정상 순서로 발생하지 않는다. macOS 에서 window-all-closed 가 quit 을
// 막으면(트레이 앱 패턴) 앱이 살아남아 Squirrel.Mac 의 ShipIt 이 번들 교체를 못 하고
// 무한 대기한다. 그래서 quitAndInstall 직전 이 플래그를 세우고, window-all-closed 에서
// 확인해 macOS 에서도 app.quit() 을 강제한다.
// 출처: https://github.com/electron/electron/issues/15453 (Electron 메인테이너 권장)
let quittingForUpdate = false;

export function isQuittingForUpdate(): boolean {
  return quittingForUpdate;
}

export function setupAutoUpdater(): void {
  // electron-updater 내부 로그(quitAndInstall / proxy server / nativeUpdater 이벤트)를
  // 파일로 남긴다 — 프로덕션에서 업데이트 실패 원인을 사후 확인하기 위함.
  // 로그 경로(macOS): ~/Library/Logs/ASIS/main.log
  autoUpdater.logger = log;
  log.transports.file.level = 'info';

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

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
