import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import VideoRecorder from './component/VideoRecorder';
import './asset/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('화면 녹화 컨트롤 #root 못 찾음');
}

createRoot(rootElement).render(
  <StrictMode>
    <VideoRecorder />
  </StrictMode>,
);
