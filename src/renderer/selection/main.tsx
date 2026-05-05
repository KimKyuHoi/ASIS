import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('영역 선택 오버레이의 #root 를 찾지 못했다.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
