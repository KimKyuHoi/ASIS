import type { JSX } from 'react';
import { Badge, Button, TextField } from '../../../design-system/component';
import type { GuideDraftStep } from '../../../../shared/step-guide';
import type { GuideEditorStrings } from '../../lib/editor-strings';
import ShotPreview from './ShotPreview';
import StepCanvas from './StepCanvas';
import StepToolbar from './StepToolbar';

type Props = {
  step: GuideDraftStep;
  index: number;
  total: number;
  t: GuideEditorStrings;
  onCaption: (value: string) => void;
  onNote: (value: string) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
};

/** 선택한 단계 편집 — 안내 문구·부연 설명·순서·삭제 + 화면 미리보기. */
export default function StepDetail({
  step,
  index,
  total,
  t,
  onCaption,
  onNote,
  onMove,
  onRemove,
}: Props): JSX.Element {
  const noteId = `ge-note-${step.id}`;
  return (
    <section className="ge-step">
      <div className="ge-step__bar">
        <span className="ge-step__position">{t.stepPosition(index + 1, total)}</span>
        {step.appName ? <Badge tone="accent">{step.appName}</Badge> : null}
        <span className="ge-step__spacer" />
        <Button disabled={index === 0} onClick={(): void => onMove(index - 1)}>
          {t.moveUp}
        </Button>
        <Button disabled={index === total - 1} onClick={(): void => onMove(index + 1)}>
          {t.moveDown}
        </Button>
        <Button variant="destructive" onClick={onRemove}>
          {t.remove}
        </Button>
      </div>

      <TextField
        className="ge-field ge-field--caption"
        label={t.captionLabel}
        value={step.caption}
        placeholder={t.captionPlaceholder}
        onChange={onCaption}
      />

      <span className="ds-field ge-field">
        <label className="ds-field__label" htmlFor={noteId}>{t.noteLabel}</label>
        <textarea
          id={noteId}
          className="ds-field__input ge-textarea"
          value={step.note}
          placeholder={t.notePlaceholder}
          rows={2}
          onChange={(event): void => onNote(event.target.value)}
        />
      </span>

      {step.kind === 'image' ? (
        <div className="ge-annotate">
          <p className="ge-annotate__hint">{t.annotateHint}</p>
          <StepToolbar />
          <StepCanvas loadingText={t.loadingImage} />
        </div>
      ) : (
        <>
          <p className="ge-annotate__hint">{t.gifNoAnnotate}</p>
          <ShotPreview step={step} alt={t.shotAlt(index + 1)} />
        </>
      )}
    </section>
  );
}
