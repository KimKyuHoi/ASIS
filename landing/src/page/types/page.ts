import type { Language } from '../../i18n/lib/language';
import type { Route } from '../../nav/types/route';

/**
 * 한 장의 정적 페이지 = 라우트 × 언어.
 * 프리렌더(빌드)와 브라우저 hydrate 가 같은 값을 써야 마크업이 어긋나지 않는다.
 */
export type Page = {
  route: Route
  lang: Language
};
