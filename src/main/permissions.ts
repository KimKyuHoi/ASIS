import { dialog, shell, systemPreferences } from 'electron';
import { is } from '@electron-toolkit/utils';
import { tMain } from './i18n/strings';

const SCREEN_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

function screenStatus(): string {
  if (process.platform !== 'darwin') return 'granted';
  return systemPreferences.getMediaAccessStatus('screen');
}

/** 화면 녹화 설정 패널 열기. 실패해도 사용자가 수동으로 열 수 있으므로 치명적이지 않다. */
function openScreenSettings(): void {
  shell.openExternal(SCREEN_URL).catch((err: unknown) => {
    if (is.dev) console.warn('[asis] 시스템 설정 열기 실패', err);
  });
}

/** 앱 시작 시 한 번 호출 — 권한 상태에 따라 안내 다이얼로그 표시. */
export async function checkPermissionsOnLaunch(): Promise<void> {
  const status = screenStatus();
  if (status === 'granted' || status === 'unknown') return;

  const isDenied = status === 'denied' || status === 'restricted';

  const t = tMain().permissions;
  const { response } = await dialog.showMessageBox({
    type: isDenied ? 'warning' : 'info',
    title: isDenied ? t.launchDeniedTitle : t.launchInfoTitle,
    message: isDenied ? t.launchDeniedMessage : t.launchInfoMessage,
    detail: isDenied ? t.launchDeniedDetail : t.launchInfoDetail,
    buttons: [t.openSettingsButton, isDenied ? t.laterButton : t.confirmButton],
    defaultId: isDenied ? 0 : 1,
    cancelId: 1,
  });

  if (response === 0) openScreenSettings();
}

/**
 * 캡처 직전에 호출 — 권한이 거부된 경우 다이얼로그를 띄우고 false 반환.
 * not-determined 는 screencapture 실행 시 macOS 가 자동으로 프롬프트.
 */
export async function guardCapture(): Promise<boolean> {
  const status = screenStatus();
  if (status !== 'denied' && status !== 'restricted') return true;

  const t = tMain().permissions;
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: t.launchDeniedTitle,
    message: t.launchDeniedMessage,
    detail: t.guardDeniedDetail,
    buttons: [t.openSettingsButton, t.closeButton],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) openScreenSettings();
  return false;
}

export function openPermissionSettings(): void {
  openScreenSettings();
}
