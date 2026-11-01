import { HOTKEY_DISABLED } from '../../../shared/editor-hotkeys';
import type { HotkeyRowModel } from '../types/hotkey-row';

type RowParams<K extends string> = {
  ids: readonly K[];
  values: Record<K, string>;
  /** 지금 녹화 중인 행. 없으면 null */
  recordingId: K | null;
  conflicts: Set<string>;
  labels: Record<K, string>;
  recordingHint: string;
  noneLabel: string;
  /** 저장값 → 화면 표기 (예: accelerator → ⌘⇧A) */
  format: (value: string) => string;
};

/** 단축키 표의 행 모델 — 렌더에 필요한 표시 문자열과 상태만 뽑는다. */
export function hotkeyRows<K extends string>(params: RowParams<K>): HotkeyRowModel<K>[] {
  const { ids, values, recordingId, conflicts, labels, recordingHint, noneLabel, format } = params;
  return ids.map((id) => {
    const value = values[id];
    const empty = value === HOTKEY_DISABLED;
    if (id === recordingId) {
      // 녹화 중에도 지금 값이 다른 행과 겹친다는 표시는 유지한다.
      return {
        id,
        label: labels[id],
        display: recordingHint,
        state: 'recording',
        conflicted: !empty && conflicts.has(value),
      };
    }
    return {
      id,
      label: labels[id],
      display: empty ? noneLabel : format(value),
      state: empty ? 'empty' : 'set',
      conflicted: conflicts.has(value),
    };
  });
}
