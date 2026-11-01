import type { JSX } from 'react';
import { DEFAULT_EDITOR_HOTKEYS, EDITOR_TOOLS } from '../../../../shared/editor-hotkeys';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { Button } from '../../../design-system/component';
import { useHotkeyRecording } from '../../hook/useHotkeyRecording';
import { useSettingsData } from '../../hook/useSettingsData';
import { findDuplicates } from '../../lib/hotkey-rules';
import { DEFAULT_HOTKEYS, HOTKEY_FIELDS } from '../../lib/settings-defaults';
import { settingsStrings } from '../../lib/strings';
import { FolderGroup, GeneralGroup, LanguageGroup } from './GeneralGroups';
import { HotkeySections } from './HotkeySections';

/**
 * 환경설정 — macOS 설정 관례: 문장형 제목의 그룹 박스, 팝업 버튼, 강조색 체크박스.
 * 내용은 스크롤되고 [기본값으로] [저장] 은 창 아래에 고정된다.
 */
export default function Settings(): JSX.Element {
  const lang = useLanguage();
  const t = settingsStrings[lang];
  const data = useSettingsData();
  const { hotkeys, setHotkeys, editorHotkeys, setEditorHotkeys } = data;
  const [recording, setRecording] = useHotkeyRecording({ setHotkeys, setEditorHotkeys });

  // 같은 조합이 두 곳 이상에 지정되면 등록 자체가 실패한다 — main 의 _register 는
  // 실패 시 이미 등록한 것까지 전부 해제하고 throw 한다(main/shortcuts.ts:_register).
  // 저장 전에 막아야 "모든 단축키가 죽는" 상태를 피할 수 있다.
  const conflicts = findDuplicates(HOTKEY_FIELDS.map((field) => hotkeys[field]));
  // 에디터 도구 키 중복 — 등록 실패는 아니지만 먼저 매칭된 도구만 동작해 혼란스럽다.
  const editorConflicts = findDuplicates(EDITOR_TOOLS.map((tool) => editorHotkeys[tool]));
  const hasConflict = conflicts.size > 0 || editorConflicts.size > 0;

  const handleSave = (): void => {
    // 버튼이 disabled 지만 한 번 더 막는다 — 중복 저장은 전역 단축키 전체 해제로 이어진다.
    if (hasConflict) return;
    Promise.all([
      window.settings.set(hotkeys),
      window.settings.setEditorHotkeys(editorHotkeys),
      window.settings.setMisc(data.misc),
    ]).then(() => {
      // 저장이 끝나면 창을 닫는다 — ESC 와 같은 경로(settings:close → SettingsWindowManager.stop).
      // 실패하면 닫지 않고 콘솔에 남긴다. 사용자가 다시 시도할 수 있어야 한다.
      window.settings.close();
    }).catch((err: unknown) => {
      console.error('[asis settings] save failed', err);
    });
  };

  const handleReset = (): void => {
    // 녹화 중에 눌러도 기본값이 남도록 녹화를 먼저 끈다 —
    // 안 그러면 다음 키 입력이 방금 되돌린 값을 곧바로 덮어쓴다.
    setRecording(null);
    setHotkeys(DEFAULT_HOTKEYS);
    setEditorHotkeys(DEFAULT_EDITOR_HOTKEYS);
  };

  const handlePickFolder = (): void => {
    window.settings.pickFolder().then((picked) => {
      if (picked !== null) data.setFolderPath(picked);
    }).catch((err: unknown) => {
      console.error('[asis settings] pickFolder failed', err);
    });
  };

  return (
    <div className="settings">
      <h1 className="ds-visually-hidden">{t.title}</h1>
      <div className="settings__scroll">
        {data.running.length > 0 ? (
          <p className="settings-notice settings-notice--info" role="status">
            {t.runningWarning(data.running.map((feature) => t.runningFeatureLabels[feature]).join(', '))}
          </p>
        ) : null}
        <LanguageGroup t={t} lang={lang} />
        <FolderGroup t={t} folderPath={data.folderPath} onPick={handlePickFolder} />
        <GeneralGroup t={t} misc={data.misc} setMisc={data.setMisc} />
        <HotkeySections
          t={t}
          data={data}
          recording={recording}
          setRecording={setRecording}
          conflicts={conflicts}
          editorConflicts={editorConflicts}
        />
      </div>
      <footer className="settings__actions">
        <Button onClick={handleReset}>{t.reset}</Button>
        <Button variant="primary" onClick={handleSave} disabled={hasConflict}>
          {t.save}
        </Button>
      </footer>
    </div>
  );
}
