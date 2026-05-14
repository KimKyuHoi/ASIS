import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import History from './component/History';
import './asset/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('히스토리 창의 #root 를 찾지 못했다.');
}

createRoot(rootElement).render(
  <StrictMode>
    <History />
  </StrictMode>,
);
