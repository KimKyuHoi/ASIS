import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ScrollCapture from './component/ScrollCapture';
import './asset/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('스크롤 캡처 컨트롤 #root 못 찾음');
}

createRoot(rootElement).render(
  <StrictMode>
    <ScrollCapture />
  </StrictMode>,
);
