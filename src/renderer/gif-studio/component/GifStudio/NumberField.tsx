import { useState, type JSX } from 'react';

/**
 * 입력 중에는 문자열 그대로 두고, blur·Enter 때만 숫자로 확정하는 입력칸.
 * 키마다 clamp 하면 "640" 을 치는 도중 "6" 이 최소값으로 튀어 원하는 값을 못 넣는다.
 * 확정 값이 유효하지 않으면(빈 칸·NaN) 직전 값으로 되돌린다.
 */
export function NumberField({
  value,
  onCommit,
  disabled = false,
  min,
  max,
}: {
  value: number;
  onCommit: (next: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
}): JSX.Element {
  // null = 편집 중 아님 → value 를 그대로 표시.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (): void => {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (draft.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed);
  };

  return (
    <input
      type="number"
      className="number-field"
      min={min}
      max={max}
      disabled={disabled}
      value={draft ?? String(value)}
      onChange={(e): void => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e): void => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}
