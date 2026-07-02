import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import StepGuide from './component/StepGuide';
import './asset/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('스텝 가이드 컨트롤 #root 못 찾음');
}

createRoot(rootElement).render(
  <StrictMode>
    <StepGuide />
  </StrictMode>,
);
