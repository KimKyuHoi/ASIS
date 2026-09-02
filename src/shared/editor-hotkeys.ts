/**
 * 에디터 도구 단축키 설정 — main(저장)·preload(타입)·renderer(settings/editor) 공용.
 *
 * 값은 수식키 없는 물리 키 이름('V', 'R', '1', 'F5' …, shared/key-name.ts 의
 * codeToKeyName 산출값). 빈 문자열 '' 은 "해제" — 그 도구는 키로 전환할 수 없다.
 * 환경설정에서 사용자가 바꾸며, 에디터 창은 keydown 마다 이 표를 조회한다.
 */

/** 툴바에 표시되는 순서 그대로 — Toolbar 와 환경설정 표가 같은 순서를 쓴다. */
export const EDITOR_TOOLS = [
  'select',
  'rect',
  'ellipse',
  'arrow',
  'line',
  'pen',
  'text',
  'step',
  'highlight',
  'blur',
  'mosaic',
  'eraser',
] as const;

export type EditorTool = (typeof EDITOR_TOOLS)[number];

/** 도구 → 키 이름. '' = 해제(HOTKEY_DISABLED). */
export type EditorHotkeyConfig = Record<EditorTool, string>;

/**
 * "단축키 없음" 표식 — 전역 단축키(HotkeyConfig)와 에디터 도구 단축키가 공유한다.
 * 빈 문자열을 쓰는 이유: 기존 저장 파일이 string 만 담고 있어 타입을 바꾸지 않고도
 * 구버전 설정과 호환된다.
 */
export const HOTKEY_DISABLED = '';

export const DEFAULT_EDITOR_HOTKEYS: EditorHotkeyConfig = {
  select: 'V',
  rect: 'R',
  ellipse: 'O',
  arrow: 'A',
  line: 'L',
  pen: 'P',
  text: 'T',
  step: 'S',
  highlight: 'H',
  blur: 'B',
  mosaic: 'M',
  eraser: 'E',
};
