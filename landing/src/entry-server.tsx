import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';
import { renderHead } from './meta/lib/head';
import { renderLlmsTxt } from './meta/lib/llms-txt';
import { renderSitemap } from './meta/lib/sitemap';
import { PageContext } from './page/lib/page-context';
import { ALL_PAGES, pageFile } from './page/lib/page-path';
import type { Page } from './page/types/page';

/**
 * 빌드 전용 엔트리 — `vite build --ssr` 로 번들한 뒤 scripts/prerender.mjs 가 불러 쓴다.
 * 브라우저 엔트리(main.tsx)와 같은 트리를 그려야 hydrate 가 어긋나지 않는다.
 */
export function renderPage(page: Page): { html: string; head: string } {
  const html = renderToString(
    <StrictMode>
      <PageContext value={page}>
        <App />
      </PageContext>
    </StrictMode>,
  );
  return { html, head: renderHead(page) };
}

export { ALL_PAGES, pageFile, renderLlmsTxt, renderSitemap };
