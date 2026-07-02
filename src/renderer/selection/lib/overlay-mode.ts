import type { OverlayMode } from '../types/selection';

/**
 * 오버레이 진입 모드를 URL query(`?mode=ruler`)에서 1회 파싱한다.
 *
 * main 의 loadRendererPage(win, 'selection', { mode: 'ruler' }) 가 query 로 넘긴다.
 * query 는 이 윈도우의 lifetime 동안 불변이므로 useSyncExternalStore 로 구독할
 * 외부 mutable store 가 아니다 — 모듈 로드 시 한 번 읽어 상수로 쓴다.
 *
 * 룰
 *   - null-safety.md — 알 수 없는 값이면 조용히 넘기지 않고 명시적으로 'capture'
 *     기본값으로 처리한다(기본 진입이 캡처이므로 안전한 fallback, 의도를 주석으로 표현).
 *   - side-effects.md — window.location 은 렌더 밖 1회 읽기라 effect/store 불필요.
 */
export function readOverlayMode(): OverlayMode {
  const raw = new URLSearchParams(window.location.search).get('mode');
  // 명시적으로 'ruler' 일 때만 측정 모드. 그 외(null·오타 등)는 기본 캡처 모드.
  return raw === 'ruler' ? 'ruler' : 'capture';
}
