import { useSyncExternalStore } from 'react';
import { getResolvedTheme, subscribeTheme, type ResolvedTheme } from '../lib/theme';

/** 테마 store 는 module scope 외부 상태 — useLanguage 와 같은 이유로 useSyncExternalStore. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeTheme, getResolvedTheme, getResolvedTheme);
}
