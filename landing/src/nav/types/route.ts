export type Route = 'home' | 'features' | 'faq' | 'bug';

/**
 * 라우트 = 실제 경로(/ASIS/features/ 등). 검색엔진이 탭마다 별도 페이지로 색인하도록
 * 빌드 때 경로마다 HTML 을 미리 만든다(scripts/prerender.mjs). 예전 해시 주소(#/faq)는
 * index.html 의 인라인 스크립트가 새 경로로 옮긴다.
 *
 * 순서가 곧 내비게이션 탭 순서다. 탭 라벨은 `nav/lib/strings.ts` 에서 조회한다.
 */
export const ROUTES: Route[] = ['home', 'features', 'faq', 'bug'];
