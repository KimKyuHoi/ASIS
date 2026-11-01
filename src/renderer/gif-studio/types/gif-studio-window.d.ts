import type { GifStudioAPI } from '../../../main/gif-studio/types';

// preload 가 contextBridge 로 노출하는 window.gifStudio.
// preload/index.d.ts 의 Window 선언과 merge 된다 — 코디네이터가 index.d.ts 로 옮겨도
// 같은 타입이면 충돌하지 않는다.
declare global {
  interface Window {
    gifStudio: GifStudioAPI;
  }
}
