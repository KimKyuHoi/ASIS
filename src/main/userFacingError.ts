import { getLanguage } from '../shared/i18n/language';
import { tMain } from './i18n/strings';

/**
 * 사용자에게 그대로 보여 줄 수 있는 에러.
 *
 * message 는 throw 하는 쪽이 *현재 언어 사전*으로 만든 문구다(예: `t().ffmpegMissing`).
 * ffmpeg stderr 같은 개발자용 원문은 detail 로 들고 다니며 로그에만 남긴다 —
 * 원문을 알림에 섞으면 영어 UI 에 한국어·stderr 가 그대로 노출된다.
 */
export class UserFacingError extends Error {
  readonly detail: string | undefined;

  constructor(userMessage: string, detail?: string) {
    super(userMessage);
    this.name = 'UserFacingError';
    this.detail = detail;
  }
}

/**
 * 알림·UI 에 띄울 에러 문구.
 *  - UserFacingError: 사전 문구 그대로.
 *  - 그 밖의 에러(사전을 거치지 않은 원문): 한국어 UI 는 기존처럼 원문을 보여 주고,
 *    영어 UI 에는 원문 대신 "로그를 확인" 안내를 보여 준다 — 원문 대부분이 한국어 개발자
 *    메시지라 영어 사용자에게는 읽히지 않는다. 원문은 호출측이 로그로 남긴다.
 */
export function userMessageOf(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  if (getLanguage() === 'ko') return err instanceof Error ? err.message : String(err);
  return tMain().notify.unknownError;
}
