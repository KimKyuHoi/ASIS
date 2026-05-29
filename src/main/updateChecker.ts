import { autoUpdater } from 'electron-updater';
import { dialog } from 'electron';
import { is } from '@electron-toolkit/utils';

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

export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-downloaded', (info) => {
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
          autoUpdater.quitAndInstall();
        }
      })
      .catch((err) => {
        // 다이얼로그 표시/응답 실패 — 다음 실행 시 재시도되므로 치명적이지 않다.
        if (is.dev) console.warn('[asis] 업데이트 다이얼로그 실패', err);
      });
  });

  autoUpdater.on('error', (err) => {
    if (is.dev) console.warn('[asis] auto-updater error', err);
  });
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err) => {
    if (is.dev) console.warn('[asis] update check failed', err);
  });
}
