import { dialog, shell, systemPreferences } from 'electron';
import { is } from '@electron-toolkit/utils';

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

  const { response } = await dialog.showMessageBox({
    type: isDenied ? 'warning' : 'info',
    title: isDenied ? 'ASIS — 화면 녹화 권한 없음' : 'ASIS — 권한 안내',
    message: isDenied
      ? '화면 녹화 권한이 거부되어 있습니다'
      : '화면 녹화 권한이 필요합니다',
    detail: isDenied
      ? 'ASIS의 캡처 기능을 사용하려면 화면 녹화 권한이 필요합니다.\n\n시스템 설정 → 개인정보 보호 및 보안 → 화면 녹화에서 ASIS를 켠 뒤 앱을 재시작해 주세요.'
      : 'ASIS는 캡처 기능을 위해 화면 녹화 권한을 사용합니다.\n\n처음 캡처를 시도하면 macOS가 권한을 요청합니다. "허용"을 눌러주세요.\n\n지금 시스템 설정에서 미리 허용할 수도 있습니다.',
    buttons: ['시스템 설정 열기', isDenied ? '나중에' : '확인'],
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

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'ASIS — 화면 녹화 권한 없음',
    message: '화면 녹화 권한이 거부되어 있습니다',
    detail:
      '시스템 설정 → 개인정보 보호 및 보안 → 화면 녹화에서 ASIS를 활성화한 뒤 재시작해 주세요.',
    buttons: ['시스템 설정 열기', '닫기'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) openScreenSettings();
  return false;
}

export function openPermissionSettings(): void {
  openScreenSettings();
}
