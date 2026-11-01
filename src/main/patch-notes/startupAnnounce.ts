import { app } from 'electron';
import log from 'electron-log/main';
import { settingsStore } from '../settings';
import { decideReleaseNotesAnnouncement, type AnnounceDecision } from './announce';
import { hasBundledReleaseNote } from './releaseNotes';

/**
 * 앱 시작 시 새 버전 공지 판정 + lastSeenReleaseNotes 기록.
 *
 * lastLaunchedVersion 은 index.ts 가 덮어쓰기 *전* 값을 넘긴다 — '' 면 첫 설치다.
 * 판정 자체는 announce.ts 의 순수 함수(단위 테스트 대상), 여기는 저장소·로그 배선만.
 */
export function resolveStartupReleaseNotes(lastLaunchedVersion: string): AnnounceDecision {
  const current = app.getVersion();
  const decision = decideReleaseNotesAnnouncement({
    current,
    lastSeen: settingsStore.get('lastSeenReleaseNotes'),
    firstInstall: lastLaunchedVersion === '',
    packaged: app.isPackaged,
    hasNotes: hasBundledReleaseNote(current),
  });
  if (decision.record !== null) settingsStore.set('lastSeenReleaseNotes', decision.record);
  log.info('[release-notes] announce', { current, lastLaunchedVersion, ...decision });
  return decision;
}
