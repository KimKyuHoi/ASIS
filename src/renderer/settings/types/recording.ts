import type { EditorTool } from '../../../shared/editor-hotkeys';
import type { HotkeyConfig } from './hotkeys';

/**
 * 지금 키 입력을 기다리는 행 — 전역 단축키 표와 에디터 도구 표 중 하나.
 * 두 표는 받아들이는 키가 다르다(전역: 수식키 조합 / 에디터: 수식키 없는 단일 키).
 */
export type Recording =
  | { kind: 'global'; field: keyof HotkeyConfig } |
  { kind: 'editor'; tool: EditorTool };
