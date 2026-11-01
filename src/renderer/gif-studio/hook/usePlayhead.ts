import { useSyncExternalStore } from 'react';
import { getPlayhead, subscribePlayhead } from '../lib/playhead';

/** 재생 위치(원본 초) — 재생 중에는 매 프레임 바뀐다. */
export function usePlayhead(): number {
  return useSyncExternalStore(subscribePlayhead, getPlayhead);
}
