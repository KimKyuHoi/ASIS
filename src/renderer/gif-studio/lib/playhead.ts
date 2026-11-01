/**
 * 재생 위치(원본 초) — 모듈 스코프 외부 store.
 * 재생 중에는 매 프레임 바뀌므로, 필요한 컴포넌트만 hook/usePlayhead 로 구독한다.
 */
let playhead = 0;
const listeners = new Set<() => void>();

export function getPlayhead(): number {
  return playhead;
}

export function setPlayhead(t: number): void {
  if (t === playhead) return;
  playhead = t;
  for (const listener of listeners) listener();
}

export function subscribePlayhead(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
