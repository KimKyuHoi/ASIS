import { useSyncExternalStore } from 'react';
import type { EditorHotkeyConfig } from '../../../shared/editor-hotkeys';
import { getEditorHotkeys, subscribeEditorHotkeys } from '../lib/editor-hotkeys';

/** 현재 도구 단축키 표 — 환경설정에서 바꾸면 리렌더 (툴바 표기용). */
export function useEditorHotkeys(): EditorHotkeyConfig {
  return useSyncExternalStore(subscribeEditorHotkeys, getEditorHotkeys);
}
