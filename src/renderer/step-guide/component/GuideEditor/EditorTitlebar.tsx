import type { JSX } from 'react';
import { Button, Titlebar } from '../../../design-system/component';
import type { SaveStatus } from '../../hook/useGuideSave';
import type { GuideEditorStrings } from '../../lib/editor-strings';

type Props = {
  t: GuideEditorStrings;
  status: SaveStatus;
  dirty: boolean;
  canSave: boolean;
  onSave: () => void;
};

function statusText(t: GuideEditorStrings, status: SaveStatus, dirty: boolean): string {
  switch (status.kind) {
    case 'never':
      return t.unsaved;
    case 'saving':
      return t.saving;
    case 'failed':
      return t.saveFailed;
    case 'saved':
      return dirty ? t.edited : t.savedAs(status.name);
    default: {
      const unknown: never = status;
      throw new Error(`EditorTitlebar: 알 수 없는 저장 상태 — ${JSON.stringify(unknown)}`);
    }
  }
}

/** 편집 창 제목 막대 — design-system Titlebar + 저장 상태 + [저장…]. */
export default function EditorTitlebar({ t, status, dirty, canSave, onSave }: Props): JSX.Element {
  return (
    <Titlebar
      title={t.windowTitle}
      subtitle={
        <span className={status.kind === 'failed' ? 'ge-status--error' : undefined} role="status">
          {statusText(t, status, dirty)}
        </span>
      }
      actions={
        <Button
          variant="primary"
          title={t.saveTitle}
          disabled={status.kind === 'saving' || !canSave}
          onClick={onSave}
        >
          {t.save}
        </Button>
      }
    />
  );
}
