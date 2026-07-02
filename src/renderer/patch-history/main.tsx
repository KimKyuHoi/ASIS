import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PatchHistory from './component/PatchHistory';
import './asset/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('변경 이력 #root 못 찾음');
}

createRoot(rootElement).render(
  <StrictMode>
    <PatchHistory />
  </StrictMode>,
);
