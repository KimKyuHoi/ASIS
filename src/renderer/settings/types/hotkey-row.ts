/** 단축키 표 한 행 — set: 값 있음 · empty: 해제됨 · recording: 키 입력을 기다리는 중 */
export type HotkeyRowModel<K extends string = string> = {
  id: K;
  label: string;
  display: string;
  state: 'set' | 'empty' | 'recording';
  conflicted: boolean;
};
