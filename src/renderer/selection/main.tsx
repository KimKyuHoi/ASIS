import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SelectionOverlay from './component/SelectionOverlay';
import RulerOverlay from './component/RulerOverlay';
import { readOverlayMode } from './lib/overlay-mode';
import { setLanguage } from '../../shared/i18n/language';
import './asset/styles.css';

// 언어 초기화 — preload 가 main 에서 동기 조회한 현재 언어로 시작하고,
// 변경 broadcast 를 앱 수명 동안 구독한다 (모듈 스코프 1회 — cleanup 불필요).
setLanguage(window.i18n.getLanguage());
window.i18n.onLanguageChanged(setLanguage);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('영역 선택 오버레이의 #root 를 찾지 못했다.');
}

// URL query(`?mode=ruler`)로 캡처/측정 오버레이를 분기한다.
// 같은 selection renderer 엔트리를 재사용해 background/element-at IPC·스타일을 공유한다.
const mode = readOverlayMode();

createRoot(rootElement).render(
  <StrictMode>
    {mode === 'ruler' ? <RulerOverlay /> : <SelectionOverlay />}
  </StrictMode>,
);
