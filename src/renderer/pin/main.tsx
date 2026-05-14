import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Pin from './component/Pin';
import './asset/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('핀 윈도우의 #root 를 찾지 못했다.');
}

createRoot(rootElement).render(
  <StrictMode>
    <Pin />
  </StrictMode>,
);
