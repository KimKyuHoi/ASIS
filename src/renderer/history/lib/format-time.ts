import type { Language } from '../../../shared/i18n/language';

/** 캡처 시각(timestamp, ms) → 언어별 로컬 시:분:초 문자열. */
export function formatTimestamp(ts: number, lang: Language): string {
  const d = new Date(ts);
  const locale = lang === 'ko' ? 'ko-KR' : 'en-US';
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
