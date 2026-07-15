import { useSyncExternalStore } from 'react';
import { getLanguage, subscribeLanguage, type Language } from './language';

/**
 * 현재 언어 — 변경 시 리렌더 (renderer 전용).
 * 컴포넌트는 `const t = strings[useLanguage()]` 형태로 도메인 사전을 읽는다.
 */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage);
}
