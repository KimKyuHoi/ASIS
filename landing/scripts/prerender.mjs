// 페이지(라우트 × 언어)마다 정적 HTML 을 만든다. 검색엔진과 JS 를 실행하지 않는 AI 크롤러가
// 빈 <div id="root"> 대신 실제 본문을 읽게 하려는 것. 브라우저에서는 main.tsx 가 그 위에 hydrate 한다.
//
// 순서: `vite build`(→ ../docs) → `vite build --ssr`(→ dist/ssr) → 이 스크립트.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../../docs/', import.meta.url));
const ssrEntry = new URL('../dist/ssr/entry-server.mjs', import.meta.url);

const { ALL_PAGES, pageFile, renderPage, renderSitemap, renderLlmsTxt } = await import(ssrEntry.href);

// 클라이언트 빌드가 방금 쓴 index.html 이 템플릿이다(에셋 해시가 들어 있다).
// 프리렌더 홈이 같은 파일을 덮어쓰므로, 덮어쓰기 전에 한 번만 읽는다.
const template = await readFile(`${outDir}index.html`, 'utf8');
for (const marker of ['<!--app-head-->', '<!--app-html-->', '<html lang="en">']) {
  if (!template.includes(marker)) throw new Error(`template is missing ${marker} — check landing/index.html`);
}

for (const page of ALL_PAGES) {
  const { html, head } = renderPage(page);
  const output = template
    .replace('<html lang="en">', `<html lang="${page.lang}">`)
    .replace('<!--app-head-->', head)
    .replace('<!--app-html-->', html);
  const file = `${outDir}${pageFile(page)}`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, output);
  console.log(`prerendered ${pageFile(page)}`);
}

const today = new Date().toISOString().slice(0, 10);
await writeFile(`${outDir}sitemap.xml`, renderSitemap(today));
await writeFile(`${outDir}llms.txt`, renderLlmsTxt());
console.log('wrote sitemap.xml, llms.txt');
