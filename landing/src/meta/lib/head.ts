import { LANGUAGES } from '../../i18n/lib/language';
import { pageUrl } from '../../page/lib/page-path';
import type { Page } from '../../page/types/page';
import { META_STRINGS } from './strings';
import { ogImageUrl, structuredData } from './structured-data';

/** 버그 제보 탭은 댓글 위젯이 대부분이라 검색 결과로 보낼 가치가 없다 — 색인·사이트맵에서 뺀다. */
export function isIndexable(page: Page): boolean {
  return page.route !== 'bug';
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** <script> 안의 JSON 이 `</script>` 로 끊기지 않게 '<' 를 이스케이프한다. */
function jsonForScript(value: object): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * 페이지별 <head> 태그 — 프리렌더 때 index.html 의 <!--app-head--> 자리에 들어간다.
 * 언어별 URL 이 서로를 hreflang 으로 가리키고, x-default 는 영어판이다.
 */
export function renderHead(page: Page): string {
  const meta = META_STRINGS[page.lang];
  const { title, description } = meta.pages[page.route];
  const url = pageUrl(page);
  const image = ogImageUrl(page.lang);
  const otherLocales = LANGUAGES.filter((l) => l !== page.lang).map((l) => META_STRINGS[l].ogLocale);

  const tags = [
    `<title>${escapeAttr(title)}</title>`,
    `<meta name="description" content="${escapeAttr(description)}" />`,
    isIndexable(page) ? '' : '<meta name="robots" content="noindex, follow" />',
    `<link rel="canonical" href="${url}" />`,
    ...LANGUAGES.map(
      (lang) => `<link rel="alternate" hreflang="${lang}" href="${pageUrl({ route: page.route, lang })}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${pageUrl({ route: page.route, lang: 'en' })}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="ASIS" />',
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:locale" content="${meta.ogLocale}" />`,
    ...otherLocales.map((locale) => `<meta property="og:locale:alternate" content="${locale}" />`),
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    ...structuredData(page).map(
      (data) => `<script type="application/ld+json">${jsonForScript(data)}</script>`,
    ),
  ];
  return tags.filter((tag) => tag !== '').join('\n    ');
}
