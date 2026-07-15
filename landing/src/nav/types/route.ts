export type Route = 'home' | 'features' | 'faq' | 'bug';

export type NavItem = {
  route: Route
  hash: string
};

/**
 * 해시 라우트 정의. GitHub Pages 정적 호스팅에서 서버 rewrite 없이 동작하도록
 * path 대신 `#/...` 해시를 쓴다. `#download` 처럼 `#/` 로 시작하지 않는 해시는
 * 라우트가 아니라 홈 내부 앵커로 취급한다(parseRoute 참고).
 *
 * 탭 라벨은 언어별로 달라지므로 여기 두지 않고 `nav/lib/strings.ts` 에서 조회한다.
 */
export const NAV_ITEMS: NavItem[] = [
  { route: 'home', hash: '#/' },
  { route: 'features', hash: '#/features' },
  { route: 'faq', hash: '#/faq' },
  { route: 'bug', hash: '#/bug' },
];

export function parseRoute(hash: string): Route {
  if (hash === '#/features') return 'features';
  if (hash === '#/faq') return 'faq';
  if (hash === '#/bug') return 'bug';
  // '#/', '#download', '#features'(앵커), '' 등은 모두 홈으로 본다.
  return 'home';
}
