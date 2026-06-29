import { useSyncExternalStore } from 'react';
import { parseRoute, type Route } from '../types/route';

/**
 * 브라우저 location.hash 는 React 외부 상태다.
 * side-effect 룰에 따라 useEffect 가 아니라 useSyncExternalStore 로 읽는다
 * (concurrent rendering tearing 방지).
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

function getSnapshot(): string {
  return window.location.hash;
}

export function useHashRoute(): Route {
  // 이 앱은 CSR 전용(GitHub Pages 정적 SPA)이라 server snapshot 은 빈 해시 → 홈.
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '');
  return parseRoute(hash);
}
