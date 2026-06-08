import { useEditorStore } from './store';

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

  const api = window.editor;
  if (!api) {
    console.error('[asis editor] window.editor 미노출 — preload 셋업 확인.');
    throw new Error('window.editor 가 노출되지 않았다.');
  }

  // main → renderer 단발 init: image path + 크기. zustand store 에 직접 commit.
  // 모듈 스코프 single-init 이라 윈도우 수명 = 리스너 수명 → cleanup 불필요.
  // (컴포넌트 useEffect 와 달리 재마운트가 없으므로 반환된 off 를 의도적으로 버린다.)
  api.onLoadImage((dataUrl, w, h) => {
    // main 이 캡처 PNG 를 data URL 로 보낸다 — dev(http 페이지)에서 file:// 가
    // 차단되고, cross-origin 이미지는 canvas 를 taint 시켜 export 를 깨뜨리므로.
    console.info(`[asis editor] onLoadImage bytes=${dataUrl.length} w=${w} h=${h}`);
    useEditorStore.getState().loadImage(dataUrl, w, h);
  });

  // listener 등록 *후* main 에 ready 신호 — race 방지.
  api.ready();
  console.info('[asis editor] IPC bridge 초기화 완료, api.ready() 호출');
}
