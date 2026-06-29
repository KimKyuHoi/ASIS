export type Route = 'home' | 'features' | 'faq' | 'bug';

export type NavItem = {
  route: Route
  hash: string
  label: string
};

/**
 * 해시 라우트 정의. GitHub Pages 정적 호스팅에서 서버 rewrite 없이 동작하도록
 * path 대신 `#/...` 해시를 쓴다. `#download` 처럼 `#/` 로 시작하지 않는 해시는
 * 라우트가 아니라 홈 내부 앵커로 취급한다(parseRoute 참고).
 */
export const NAV_ITEMS: NavItem[] = [
  { route: 'home', hash: '#/', label: '홈' },
  { route: 'features', hash: '#/features', label: '기능 상세' },
  { route: 'faq', hash: '#/faq', label: 'FAQ·문의' },
  { route: 'bug', hash: '#/bug', label: '버그 제보' },
];

export function parseRoute(hash: string): Route {
  if (hash === '#/features') return 'features';
  if (hash === '#/faq') return 'faq';
  if (hash === '#/bug') return 'bug';
  // '#/', '#download', '#features'(앵커), '' 등은 모두 홈으로 본다.
  return 'home';
}
