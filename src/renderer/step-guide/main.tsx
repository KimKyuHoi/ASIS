import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { getLanguage, setLanguage } from '../../shared/i18n/language';
import { guideEditorStrings } from './lib/editor-strings';

/*
 * 'step-guide' 엔트리 하나가 두 창을 띄운다 — vite 엔트리를 늘리지 않으려고 query 로 가른다.
 *   - (기본)        녹화 HUD — 화면 위 알약, 항상 다크.
 *   - ?view=editor  녹화 [완료] 후 편집 창(main: stepGuideEditorWindow.ts).
 * 각 화면은 자기 CSS 를 직접 import 하므로 lazy 로 갈라 서로의 전역 스타일(HUD 의
 * 투명 배경·overflow hidden 등)이 섞이지 않게 한다.
 */
const StepGuide = lazy(() => import('./component/StepGuide'));
const GuideEditor = lazy(() => import('./component/GuideEditor'));

// 언어 초기화 — preload 가 main 에서 동기 조회한 현재 언어로 시작하고,
// 변경 broadcast 를 앱 수명 동안 구독한다 (모듈 스코프 1회 — cleanup 불필요).
setLanguage(window.i18n.getLanguage());
window.i18n.onLanguageChanged(setLanguage);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('스텝 가이드 #root 못 찾음');
}

const isEditor = new URLSearchParams(window.location.search).get('view') === 'editor';

if (isEditor) {
  // 편집 창은 시스템 라이트/다크를 따른다 — index.html 의 HUD 용 강제 다크를 뗀다.
  document.documentElement.removeAttribute('data-appearance');
  // <title> 이 BrowserWindow 제목을 덮어쓰므로 편집 창 제목으로 맞춘다.
  document.title = guideEditorStrings[getLanguage()].windowTitle;
}

// 초안은 창마다 한 번만 받는다 — 렌더마다 새 promise 를 만들지 않도록 모듈 스코프.
// 받자마자 클릭 위치 기본 동그라미를 단계별 주석 문서에 넣는다(렌더 전에 한 번).
const draftPromise = isEditor
  ? window.stepGuideEditor.getDraft().then(async (draft) => {
    const { seedClickCircles } = await import('./lib/step-annotations');
    seedClickCircles(draft.steps);
    return draft;
  })
  : null;

createRoot(rootElement).render(
  <StrictMode>
    <Suspense fallback={null}>
      {draftPromise ? <GuideEditor draftPromise={draftPromise} /> : <StepGuide />}
    </Suspense>
  </StrictMode>,
);
