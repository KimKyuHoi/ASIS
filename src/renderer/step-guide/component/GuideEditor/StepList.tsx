import { useState, type JSX, type KeyboardEvent } from 'react';
import type { GuideDraftStep } from '../../../../shared/step-guide';
import type { GuideEditorStrings } from '../../lib/editor-strings';

type Props = {
  steps: GuideDraftStep[];
  selectedId: string | null;
  t: GuideEditorStrings;
  onSelect: (id: string) => void;
  onMove: (id: string, to: number) => void;
};

/**
 * 왼쪽 단계 목록 — 썸네일 + 번호 + 문장. 끌어서 순서 변경.
 * 키보드: ↑/↓ 선택 이동, ⌥↑/⌥↓ 선택한 단계 옮기기.
 */
export default function StepList({ steps, selectedId, t, onSelect, onMove }: Props): JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const index = steps.findIndex((s) => s.id === selectedId);
    if (index < 0) return;
    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? -1 : 1;
    if (event.altKey) {
      onMove(steps[index].id, index + delta);
      return;
    }
    const next = steps.at(Math.max(0, Math.min(steps.length - 1, index + delta)));
    if (next) onSelect(next.id);
  };

  const endDrag = (): void => {
    setDragId(null);
    setOverIndex(null);
  };

  return (
    <ol className="ge-list" aria-label={t.stepsHeading(steps.length)} onKeyDown={onKeyDown}>
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={[
            'ge-item',
            step.id === selectedId ? 'ge-item--selected' : '',
            step.id === dragId ? 'ge-item--dragging' : '',
            overIndex === index && dragId !== step.id ? 'ge-item--over' : '',
          ].join(' ')}
          draggable
          onDragStart={(event): void => {
            setDragId(step.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(event): void => {
            event.preventDefault();
            setOverIndex(index);
          }}
          onDrop={(event): void => {
            event.preventDefault();
            if (dragId) onMove(dragId, index);
            endDrag();
          }}
          onDragEnd={endDrag}
        >
          <button
            type="button"
            className="ge-item__button"
            aria-current={step.id === selectedId ? 'step' : undefined}
            onClick={(): void => onSelect(step.id)}
          >
            <span className="ge-item__num tabular">{index + 1}</span>
            <span className="ge-item__thumb">
              <img src={step.imageDataUrl} alt="" />
              {step.kind === 'gif' ? <span className="ge-item__badge">{t.gifBadge}</span> : null}
            </span>
            <span className="ge-item__caption">{step.caption || t.captionPlaceholder}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
