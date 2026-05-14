import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Settings from './component/Settings';
import './asset/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('설정 창의 #root 를 찾지 못했다.');
}

createRoot(rootElement).render(
  <StrictMode>
    <Settings />
  </StrictMode>,
);
