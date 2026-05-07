import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('녹화 컨트롤 #root 못 찾음');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
