import { useSyncExternalStore } from 'react';
import { getResolvedTheme, SERVER_THEME, subscribeTheme, type ResolvedTheme } from '../lib/theme';

function getServerSnapshot(): ResolvedTheme {
  return SERVER_THEME;
}

/**
 * 테마 store 는 module scope 외부 상태라 useSyncExternalStore 로 읽는다.
 * 프리렌더 HTML 과 hydrate 첫 렌더는 SERVER_THEME 으로 맞추고(마크업 불일치 방지),
 * 그 직후 실제 테마로 다시 그린다.
 */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeTheme, getResolvedTheme, getServerSnapshot);
}
