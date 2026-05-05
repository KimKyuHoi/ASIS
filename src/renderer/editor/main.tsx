import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('어노테이션 에디터의 #root 를 찾지 못했다.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
