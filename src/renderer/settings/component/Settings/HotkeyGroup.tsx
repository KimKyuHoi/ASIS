import type { JSX, ReactNode } from 'react';
import { Badge, Group, Icon, IconButton, Row } from '../../../design-system/component';
import { cx } from '../../../design-system/lib/cx';
import type { HotkeyRowModel } from '../../types/hotkey-row';

type HotkeyGroupProps<K extends string> = {
  title: string;
  footer: string;
  /** 중복 경고 — 있으면 표 위에 알린다(저장 차단 사유). */
  warning: string | null;
  rows: HotkeyRowModel<K>[];
  conflictBadge: string;
  clearLabel: string;
  onToggleRecording: (id: K) => void;
  onClear: (id: K) => void;
  /** 표 맨 위 행 (프리셋 적용 등) */
  leading?: ReactNode;
};

/** 단축키 표 — 행마다 [중복 배지] [키 입력 버튼] [해제]. */
export function HotkeyGroup<K extends string>({
  title,
  footer,
  warning,
  rows,
  conflictBadge,
  clearLabel,
  onToggleRecording,
  onClear,
  leading,
}: HotkeyGroupProps<K>): JSX.Element {
  return (
    <Group title={title} footer={footer}>
      {warning === null ? null : (
        <p className="settings-notice settings-notice--warn" role="alert">
          {warning}
        </p>
      )}
      {leading}
      {rows.map((row) => (
        <Row key={row.id} label={row.label}>
          {row.conflicted ? <Badge tone="warning">{conflictBadge}</Badge> : null}
          <button
            type="button"
            className={cx(
              'hotkey-field',
              `hotkey-field--${row.state}`,
              row.conflicted && 'hotkey-field--conflict',
            )}
            aria-pressed={row.state === 'recording'}
            aria-label={`${row.label}: ${row.display}`}
            onClick={(): void => onToggleRecording(row.id)}
          >
            {row.display}
          </button>
          {row.state === 'set' ? (
            <IconButton label={clearLabel} icon={<Icon name="close" size={12} />} onClick={(): void => onClear(row.id)} />
          ) : (
            <span className="hotkey-clear-slot" aria-hidden="true" />
          )}
        </Row>
      ))}
    </Group>
  );
}
