import { LANGUAGES, type Language } from '../../i18n/lib/language';
import { ROUTES, type Route } from '../../nav/types/route';
import type { Page } from '../types/page';

/** vite.config.ts 의 base 와 같아야 한다. */
export const BASE_PATH = '/ASIS/';
export const SITE_ORIGIN = 'https://kimkyuhoi.github.io';

/** 영어가 기본(접두어 없음), 한국어는 /ko/ 아래에 둔다. */
const LANG_PREFIX: Record<Language, string> = { en: '', ko: 'ko/' };

const ROUTE_SEGMENT: Record<Route, string> = {
  home: '',
  features: 'features/',
  faq: 'faq/',
  bug: 'bug/',
};

export const ALL_PAGES: Page[] = LANGUAGES.flatMap((lang) =>
  ROUTES.map((route) => ({ route, lang })),
);

/** 사이트 안 링크용 절대 경로 (예: /ASIS/ko/faq/). */
export function pagePath({ route, lang }: Page): string {
  return `${BASE_PATH}${LANG_PREFIX[lang]}${ROUTE_SEGMENT[route]}`;
}

/** canonical·hreflang·sitemap 용 전체 URL. */
export function pageUrl(page: Page): string {
  return `${SITE_ORIGIN}${pagePath(page)}`;
}

/** 빌드 산출물(docs/) 안에서의 파일 위치 (예: ko/faq/index.html). */
export function pageFile(page: Page): string {
  return `${pagePath(page).slice(BASE_PATH.length)}index.html`;
}

/**
 * location.pathname → Page. 프리렌더한 경로 외의 값(dev 서버의 임의 경로 등)은
 * 홈으로 본다 — GitHub Pages 에서는 없는 경로가 404 로 끝나 여기까지 오지 않는다.
 */
export function parsePagePath(pathname: string): Page {
  const parts = pathname.startsWith(BASE_PATH)
    ? pathname.slice(BASE_PATH.length).split('/').filter((part) => part !== '')
    : [];
  const lang: Language = parts[0] === 'ko' ? 'ko' : 'en';
  const segment = lang === 'ko' ? parts[1] : parts[0];
  const route = ROUTES.find((r) => r !== 'home' && ROUTE_SEGMENT[r] === `${segment}/`);
  return { route: route ?? 'home', lang };
}
