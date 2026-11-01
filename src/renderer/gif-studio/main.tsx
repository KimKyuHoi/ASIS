import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import GifStudio from './component/GifStudio';
import { initStudioSession } from './lib/session-store';
import { setLanguage } from '../../shared/i18n/language';
import './asset/styles.css';

// 언어 초기화 — editor/main.tsx 와 같다 (모듈 스코프 1회 구독, 창 수명 = 리스너 수명).
setLanguage(window.i18n.getLanguage());
window.i18n.onLanguageChanged(setLanguage);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('GIF 스튜디오의 #root 를 찾지 못했다.');
}

// mount 전에 main 의 미디어 push 구독 + 현재 미디어 조회 (editor ipc-init 과 같은 이유).
initStudioSession();

createRoot(rootElement).render(
  <StrictMode>
    <GifStudio />
  </StrictMode>,
);
