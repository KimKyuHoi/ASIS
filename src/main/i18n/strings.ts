import { defineDict, getLanguage } from '../../shared/i18n/language';
import { en } from './stringsEn';
import { ko } from './stringsKo';

/**
 * main process UI 문자열 사전.
 *
 * 사용법: `const t = tMain()` 를 *사용 시점* 에 읽는다 — 모듈 스코프에 상수로
 * 잡아두면 언어 변경이 반영되지 않는다. Tray/메뉴는 subscribeLanguage 구독으로
 * 언어 변경 시 재빌드된다 (index.ts). 싱글턴 윈도우 타이틀은 windowOptions 를
 * getter 로 두어 show() 시점의 언어를 읽는다 (onboardingWindow 참고).
 *
 * 보간이 필요한 값은 함수로 둔다: `saved: (path: string) => \`GIF 저장 — ${path}\``.
 * defineDict 가 ko/en 키·시그니처 일치를 컴파일 타임에 강제한다.
 */
export const mainStrings = defineDict({ ko, en });

/** 현재 언어의 main 문자열 — 반드시 사용 시점에 호출한다. */
export function tMain(): (typeof mainStrings)['ko'] {
  return mainStrings[getLanguage()];
}
