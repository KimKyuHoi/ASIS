import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Countdown from './component/Countdown';
import './asset/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('카운트다운 #root 못 찾음');

createRoot(rootElement).render(
  <StrictMode>
    <Countdown />
  </StrictMode>,
);
