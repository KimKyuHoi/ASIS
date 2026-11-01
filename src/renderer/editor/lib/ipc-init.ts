import { useEditorStore } from './store';
import { setEditorHotkeys } from './editor-hotkeys';
import { clearDecoded } from './decoded-images';
import { openProject, parseProject } from './editor-project';

/**
 * Editor 윈도우의 IPC bridge 초기화 — *모듈 스코프 single init*.
 *
 * .claude/rules/side-effects.md 룰 부합:
 *   "외부 store·시스템에서 React 가 상태를 읽음" — main 의 image path 송신은
 *   React lifecycle 무관 외부 이벤트. useEffect 로 컴포넌트 안에서 구독하면
 *   race/tearing 위험 (mount 전 message 도착, double-fire 등). 모듈 스코프 init
 *   으로 옮기면 컴포넌트 lifecycle 과 분리되어 안전.
 *
 * 이 파일은 editor/main.tsx 에서 *createRoot 전에* 한 번 import 만 해도 init 됨.
 */

let initialized = false;

export function ensureEditorIpcBridge(): void {
  if (initialized) return;
  initialized = true;

  // window.editor 는 preload 가 항상 노출한다(src/preload/index.d.ts). 미노출이면
  // 아래 접근이 TypeError 로 즉시 실패하므로 별도 가드는 두지 않는다.
  const api = window.editor;

  // main → renderer 단발 init: image path + 크기. zustand store 에 직접 commit.
  // 모듈 스코프 single-init 이라 윈도우 수명 = 리스너 수명 → cleanup 불필요.
  // (컴포넌트 useEffect 와 달리 재마운트가 없으므로 반환된 off 를 의도적으로 버린다.)
  api.onLoadImage((dataUrl, w, h) => {
    // main 이 캡처 PNG 를 data URL 로 보낸다 — dev(http 페이지)에서 file:// 가
    // 차단되고, cross-origin 이미지는 canvas 를 taint 시켜 export 를 깨뜨리므로.
    console.info(`[asis editor] onLoadImage bytes=${dataUrl.length} w=${w} h=${h}`);
    clearDecoded();
    useEditorStore.getState().loadImage(dataUrl, w, h);
  });

  // 다시 편집 — 히스토리 [편집]. 배경과 도형을 함께 받는다 (onLoadImage 와 같은 수명).
  // main 이 이미 검증했으므로 여기서 실패하면 버그다 — throw 로 콘솔에 남긴다.
  api.onLoadProject((value) => {
    const project = parseProject(value);
    console.info(`[asis editor] onLoadProject shapes=${String(project.shapes.length)}`);
    clearDecoded();
    openProject(project);
  });

  // 도구 단축키 표 — 저장값을 한 번 받고, 이후 환경설정 저장 push 를 반영한다.
  // onLoadImage 와 같은 이유로 cleanup 은 의도적으로 버린다 (윈도우 수명 = 리스너 수명).
  api.onHotkeysChanged(setEditorHotkeys);
  api.getHotkeys().then(setEditorHotkeys).catch((err: unknown) => {
    // 실패하면 기본 표(V/R/O …)가 그대로 남는다 — 에디터 자체는 계속 쓸 수 있다.
    console.error('[asis editor] getHotkeys 실패 — 기본 도구 단축키 사용', err);
  });

  // listener 등록 *후* main 에 ready 신호 — race 방지.
  api.ready();
  console.info('[asis editor] IPC bridge 초기화 완료, api.ready() 호출');
}
