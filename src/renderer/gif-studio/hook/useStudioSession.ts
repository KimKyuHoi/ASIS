import { useSyncExternalStore } from 'react';
import {
  getStudioSession,
  subscribeStudioSession,
  type StudioSession,
} from '../lib/session-store';

/** 지금 열린 미디어와 미리보기 자원 — main push 로 바뀌면 리렌더. */
export function useStudioSession(): StudioSession {
  return useSyncExternalStore(subscribeStudioSession, getStudioSession);
}
