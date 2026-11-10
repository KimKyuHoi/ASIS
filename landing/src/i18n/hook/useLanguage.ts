import { usePage } from '../../page/hook/usePage';
import type { Language } from '../lib/language';

/** 현재 페이지의 언어 — URL 이 정하므로 페이지 안에서는 바뀌지 않는다. */
export function useLanguage(): Language {
  return usePage().lang;
}
