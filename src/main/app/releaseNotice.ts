import { app, dialog, ipcMain } from 'electron';
import log from 'electron-log/main';
import { isLanguageChosen } from '../i18n/i18n';
import { tMain } from '../i18n/strings';
import { onboardingWindow, patchHistoryWindow } from './managers';

/**
 * 새 버전 공지 — 업데이트 뒤 첫 실행에 안내 창을 한 번 띄우고, [공지 보기] 를 누르면 변경 이력 창을 연다.
 * 한 버전에 한 번만 뜨는 것은 resolveStartupReleaseNotes 가 lastSeenReleaseNotes 로 보장한다.
 *
 * 공지가 온보딩(언어 선택) 뒤로 미뤄졌는가 — announceReleaseNotes 가 세우고 onboarding-done 이 소비.
 * 이 기능과 영어 UI 가 같은 버전에 들어가, 기존 사용자도 업그레이드 첫 실행에 언어 선택 창을 본다.
 */
let releaseNotesPendingOnboarding = false;

/**
 * 업데이트 안내 창 — 공지를 바로 펼치지 않고 열지 말지 묻는다. OS 알림은 꺼져 있으면 보이지 않아
 * 앱이 직접 띄우는 대화상자를 쓴다. [나중에] 를 눌러도 트레이 "변경 이력…" 으로 볼 수 있다.
 */
function notifyReleaseNotes(): void {
  const t = tMain().releaseNotice;
  dialog
    .showMessageBox({
      type: 'info',
      message: t.title(app.getVersion()),
      detail: t.body,
      buttons: [t.open, t.later],
      defaultId: 0,
      cancelId: 1,
    })
    .then(({ response }) => {
      if (response === 0) patchHistoryWindow.show();
    })
    .catch((err: unknown) => {
      log.error('[release-notes] 업데이트 안내 창 실패', err);
    });
}

/** 언어 선택 창이 떠 있으면 고른 언어로 보이도록 onboarding-done 뒤로 미룬다. */
export function announceReleaseNotes(show: boolean): void {
  if (!show) return;
  if (isLanguageChosen()) notifyReleaseNotes();
  else releaseNotesPendingOnboarding = true;
}

/**
 * 첫 실행 언어 선택 완료 — onboarding 창을 닫는다. 언어 저장 자체는
 * i18n:set-language(i18n/i18n.ts) 가 처리하므로 여기서는 창 정리만 한다.
 */
export function registerOnboardingDone(): void {
  ipcMain.on('i18n:onboarding-done', () => {
    onboardingWindow.stop();
    // 언어를 고르기 전에 정해진 새 버전 공지 — 고른 언어로 이어서 띄운다.
    if (releaseNotesPendingOnboarding) {
      releaseNotesPendingOnboarding = false;
      notifyReleaseNotes();
    }
  });
}
