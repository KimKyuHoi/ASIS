import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PatchHistory from './component/PatchHistory';
import { setLanguage } from '../../shared/i18n/language';
import './asset/styles.css';

// 언어 초기화 — preload 가 main 에서 동기 조회한 현재 언어로 시작하고,
// 변경 broadcast 를 앱 수명 동안 구독한다 (모듈 스코프 1회 — cleanup 불필요).
setLanguage(window.i18n.getLanguage());
window.i18n.onLanguageChanged(setLanguage);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('변경 이력 #root 못 찾음');
}

createRoot(rootElement).render(
  <StrictMode>
    <PatchHistory />
  </StrictMode>,
);
