import { useSyncExternalStore } from 'react';
import { getLanguage, subscribeLanguage, type Language } from '../lib/language';

/**
 * 언어 store 는 React 외부 상태(module scope)다.
 * side-effect 룰에 따라 useEffect 가 아니라 useSyncExternalStore 로 읽는다.
 */
export function useLanguage(): Language {
  // CSR 전용(GitHub Pages 정적 SPA)이라 server snapshot 도 동일하게 현재 값을 준다.
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}
