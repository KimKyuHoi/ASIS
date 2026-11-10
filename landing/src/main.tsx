import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import './app.css';
import App from './App';
import { PageContext } from './page/lib/page-context';
import { parsePagePath } from './page/lib/page-path';

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

// 프리렌더와 같은 규칙(parsePagePath)으로 현재 페이지를 다시 계산해야 hydrate 가 어긋나지 않는다.
const page = parsePagePath(window.location.pathname);
const app = (
  <StrictMode>
    <PageContext value={page}>
      <App />
    </PageContext>
  </StrictMode>
);

// 빌드 결과물은 프리렌더된 마크업 위에 hydrate 한다. dev 서버의 index.html 은 비어 있다.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
