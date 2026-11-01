import type { Dispatch, JSX, SetStateAction } from 'react';
import { EDITOR_TOOLS, HOTKEY_DISABLED, type EditorTool } from '../../../../shared/editor-hotkeys';
import type { Language } from '../../../../shared/i18n/language';
import { Button, Row } from '../../../design-system/component';
import type { useSettingsData } from '../../hook/useSettingsData';
import { LEFT_HAND_HOTKEYS } from '../../lib/hotkey-presets';
import { hotkeyRows } from '../../lib/hotkey-rows';
import { toDisplayString } from '../../lib/keyboard-utils';
import { HOTKEY_FIELDS } from '../../lib/settings-defaults';
import type { settingsStrings } from '../../lib/strings';
import type { HotkeyConfig } from '../../types/hotkeys';
import type { Recording } from '../../types/recording';
import { HotkeyGroup } from './HotkeyGroup';

type HotkeySectionsProps = {
  t: (typeof settingsStrings)[Language];
  data: ReturnType<typeof useSettingsData>;
  recording: Recording | null;
  setRecording: Dispatch<SetStateAction<Recording | null>>;
  conflicts: Set<string>;
  editorConflicts: Set<string>;
};

/** 전역 단축키 표 + 에디터 도구 키 표. 행을 누르면 녹화, 한 번 더 누르면 녹화 취소. */
export function HotkeySections(props: HotkeySectionsProps): JSX.Element {
  const { t, data, recording, setRecording, conflicts, editorConflicts } = props;
  const { hotkeys, setHotkeys, editorHotkeys, setEditorHotkeys } = data;
  const recordingField = recording?.kind === 'global' ? recording.field : null;
  const recordingTool = recording?.kind === 'editor' ? recording.tool : null;
  const globalRows = hotkeyRows({
    ids: HOTKEY_FIELDS,
    values: hotkeys,
    recordingId: recordingField,
    conflicts,
    labels: t.hotkeyLabels,
    recordingHint: t.recordingHint,
    noneLabel: t.hotkeyNone,
    format: toDisplayString,
  });
  const editorRows = hotkeyRows({
    ids: EDITOR_TOOLS,
    values: editorHotkeys,
    recordingId: recordingTool,
    conflicts: editorConflicts,
    labels: t.editorToolLabels,
    recordingHint: t.editorRecordingHint,
    noneLabel: t.hotkeyNone,
    format: (value) => value,
  });
  const globalWarning = conflicts.size > 0
    ? t.conflictWarning([...conflicts].map(toDisplayString).join(', '))
    : null;
  const editorWarning = editorConflicts.size > 0
    ? t.editorConflictWarning([...editorConflicts].join(', '))
    : null;

  // 녹화 중이면 먼저 끈다 — 남겨 두면 다음 키 입력이 방금 적용한 프리셋 값을 덮어쓴다.
  const applyLeftHandPreset = (): void => {
    setRecording(null);
    setHotkeys(LEFT_HAND_HOTKEYS);
  };
  return (
    <>
      <HotkeyGroup<keyof HotkeyConfig>
        title={t.hotkeySection}
        footer={t.hotkeyHint}
        warning={globalWarning}
        rows={globalRows}
        conflictBadge={t.conflictBadge}
        clearLabel={t.clearHotkey}
        onToggleRecording={(field): void => {
          setRecording(field === recordingField ? null : { kind: 'global', field });
        }}
        onClear={(field): void => {
          setRecording(null);
          setHotkeys((prev) => ({ ...prev, [field]: HOTKEY_DISABLED }));
        }}
        leading={
          <Row label={t.leftHandPresetHint}>
            <Button onClick={applyLeftHandPreset}>{t.leftHandPreset}</Button>
          </Row>
        }
      />
      <HotkeyGroup<EditorTool>
        title={t.editorHotkeySection}
        footer={t.editorHotkeyHint}
        warning={editorWarning}
        rows={editorRows}
        conflictBadge={t.conflictBadge}
        clearLabel={t.clearHotkey}
        onToggleRecording={(tool): void => {
          setRecording(tool === recordingTool ? null : { kind: 'editor', tool });
        }}
        onClear={(tool): void => {
          setRecording(null);
          setEditorHotkeys((prev) => ({ ...prev, [tool]: HOTKEY_DISABLED }));
        }}
      />
    </>
  );
}
