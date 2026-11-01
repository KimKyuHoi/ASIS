import { useSyncExternalStore } from 'react';
import { getFrames, subscribeFrames, type FramesSnapshot } from '../lib/frame-docs';

/** 프레임 격자·현재 프레임·선택 구간·주석 있는 프레임. */
export function useFrames(): FramesSnapshot {
  return useSyncExternalStore(subscribeFrames, getFrames);
}
