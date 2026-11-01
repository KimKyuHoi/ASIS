import { Notification } from 'electron';
import log from 'electron-log/main';
import { tMain } from '../i18n/strings';

// macOS 에서 알림 전달 실패(UNNotification 권한·등록 문제 등)는 기본적으로 조용히
// 사라진다. failed/show 이벤트를 로그로 남겨 "알림이 안 뜬다" 이슈를 사후 진단한다.
// https://www.electronjs.org/docs/latest/api/notification
export const notify = (title: string, body: string, onClick?: () => void): void => {
  const n = new Notification({ title, body });
  n.on('failed', (_event, error) => log.error('[notify] failed', { title, body, error }));
  n.on('show', () => log.info('[notify] shown', { title, body }));
  if (onClick) n.on('click', () => onClick());
  n.show();
};

export const notifyInfo = (body: string): void => {
  notify('ASIS', body);
};

export const notifyError = (body: string): void => {
  notify(tMain().notify.errorTitle, body);
};
