import { LANGUAGES } from '../../i18n/lib/language';
import { ALL_PAGES, pageUrl } from '../../page/lib/page-path';
import { isIndexable } from './head';

/** 색인 대상 페이지만, 언어별 짝을 xhtml:link 로 함께 적은 sitemap.xml. */
export function renderSitemap(lastmod: string): string {
  const urls = ALL_PAGES.filter(isIndexable).map((page) => {
    const alternates = LANGUAGES.map(
      (lang) =>
        `    <xhtml:link rel="alternate" hreflang="${lang}" href="${pageUrl({ route: page.route, lang })}" />`,
    );
    return [
      '  <url>',
      `    <loc>${pageUrl(page)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      ...alternates,
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl({ route: page.route, lang: 'en' })}" />`,
      '  </url>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
