import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { isLanguage } from '../../../shared/i18n/language';
import type { RunningFeature } from '../../../shared/running-features';
import { useLanguage } from '../../../shared/i18n/use-language';
import {
  DEFAULT_EDITOR_HOTKEYS,
  EDITOR_TOOLS,
  HOTKEY_DISABLED,
} from '../../../shared/editor-hotkeys';
import type { EditorHotkeyConfig, EditorTool } from '../../../shared/editor-hotkeys';
import { codeToKeyName, isEditorToolKeyName } from '../../../shared/key-name';
import { toAccelerator, toDisplayString } from '../lib/keyboard-utils';
import { settingsStrings } from '../lib/strings';

/** 전역 단축키 — 값은 accelerator, HOTKEY_DISABLED('') 는 해제. */
type HotkeyConfig = {
  region: string;
  fullscreen: string;
  window: string;
  delayedFullscreen: string;
  delayedRegion: string;
  disableClickThrough: string;
  gif: string;
  video: string;
  ocr: string;
  clipboardPin: string;
  ruler: string;
  timeMachineToggle: string;
  timeMachineSave: string;
  stepGuide: string;
  scrollCapture: string;
};

type MiscConfig = {
  gifFps: number;
  openAtLogin: boolean;
  captureSound: boolean;
  pinDefaultOpacity: number;
  delayedCaptureSeconds: number;
  autoOpenEditor: boolean;
  timeMachineBufferSeconds: number;
  drmDetectEnabled: boolean;
};

// 기본값은 src/main/settings.ts 의 DEFAULT_MISC 와 동일하게 유지한다.
const DEFAULT_MISC: MiscConfig = {
  gifFps: 15,
  openAtLogin: false,
  captureSound: true,
  pinDefaultOpacity: 1.0,
  delayedCaptureSeconds: 3,
  autoOpenEditor: true,
  timeMachineBufferSeconds: 30,
  drmDetectEnabled: true,
};

const DEFAULT: HotkeyConfig = {
  region: 'CommandOrControl+Shift+A',
  fullscreen: 'CommandOrControl+Shift+F',
  window: 'CommandOrControl+Shift+W',
  delayedFullscreen: 'CommandOrControl+Shift+D',
  delayedRegion: 'CommandOrControl+Shift+Alt+D',
  disableClickThrough: 'CommandOrControl+Shift+X',
  gif: 'CommandOrControl+Shift+G',
  video: 'CommandOrControl+Shift+E',
  ocr: 'CommandOrControl+Shift+O',
  clipboardPin: 'CommandOrControl+Shift+V',
  ruler: 'CommandOrControl+Shift+L',
  timeMachineToggle: 'CommandOrControl+Shift+T',
  timeMachineSave: 'CommandOrControl+Shift+S',
  stepGuide: 'CommandOrControl+Shift+U',
  scrollCapture: 'CommandOrControl+Shift+J',
};

const HOTKEY_FIELDS: Array<keyof HotkeyConfig> = [
  'region',
  'fullscreen',
  'window',
  'delayedFullscreen',
  'delayedRegion',
  'disableClickThrough',
  'gif',
  'video',
  'ocr',
  'clipboardPin',
  'ruler',
  'timeMachineToggle',
  'timeMachineSave',
  'stepGuide',
  'scrollCapture',
];

/**
 * 지금 키 입력을 기다리는 행 — 전역 단축키 표와 에디터 도구 표 중 하나.
 * 두 표는 받아들이는 키가 다르다(전역: 수식키 조합 / 에디터: 수식키 없는 단일 키).
 */
type Recording =
  | { kind: 'global'; field: keyof HotkeyConfig } |
  { kind: 'editor'; tool: EditorTool };

/** 수식키 없는 ⌫/Delete — 녹화 중이면 "해제" 명령. */
function isClearKey(e: KeyboardEvent): boolean {
  return (
    (e.code === 'Backspace' || e.code === 'Delete') &&
    !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
  );
}

/** 같은 값이 두 곳 이상에 지정된 값 집합. 해제('')는 여러 곳에 있어도 중복이 아니다. */
function findDuplicates(values: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value === HOTKEY_DISABLED) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
}

export default function Settings(): JSX.Element {
  const lang = useLanguage();
  const t = settingsStrings[lang];
  const [hotkeys, setHotkeys] = useState<HotkeyConfig>(DEFAULT);
  const [editorHotkeys, setEditorHotkeys] = useState<EditorHotkeyConfig>(DEFAULT_EDITOR_HOTKEYS);
  const [misc, setMisc] = useState<MiscConfig>(DEFAULT_MISC);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [folderPath, setFolderPath] = useState<string>('');
  const [running, setRunning] = useState<RunningFeature[]>([]);

  useEffect(() => {
    window.settings.get().then((cfg) => {
      setHotkeys(cfg);
    }).catch((err: unknown) => {
      console.error('[asis settings] get failed', err);
    });
    window.settings.getEditorHotkeys().then((cfg) => {
      setEditorHotkeys(cfg);
    }).catch((err: unknown) => {
      console.error('[asis settings] getEditorHotkeys failed', err);
    });
    window.settings.getFolder().then((p) => {
      setFolderPath(p);
    }).catch((err: unknown) => {
      console.error('[asis settings] getFolder failed', err);
    });
    window.settings.getMisc().then((m) => {
      setMisc(m);
    }).catch((err: unknown) => {
      console.error('[asis settings] getMisc failed', err);
    });
  }, []);

  // 실행 중 기능 조회 — 창을 열 때와 다시 focus 될 때마다 갱신한다.
  // (외부 상태지만 IPC invoke 가 Promise 라 useSyncExternalStore 대상이 아니다.
  //  main 이 push 하는 상태가 아니므로 focus 시점 pull 로 충분하다.)
  useEffect(() => {
    const refresh = (): void => {
      window.settings.getRunningFeatures().then((list) => {
        setRunning(list);
      }).catch((err: unknown) => {
        console.error('[asis settings] getRunningFeatures failed', err);
      });
    };

    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  // 녹화 중에는 main 이 전역 단축키(⌘⇧A …)와 앱 메뉴 accelerator(⌘W·⌘A·⌘Z …)를 끈다.
  // 그래야 그 조합들이 기능을 실행하지 않고 순수 키 입력으로 들어온다.
  // 에디터 도구 키 녹화는 수식키가 없어 사실상 무관하지만, 같은 경로를 타도 해가 없다.
  useEffect(() => {
    window.settings.setHotkeyRecording(recording !== null);
  }, [recording]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // 수식키 없는 ESC — 녹화 중이면 녹화만 취소하고, 아니면 창을 닫는다.
      // (⌘ESC 등 수식키 조합은 단축키로 지정 가능해야 하므로 여기서 걸러낸다)
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (recording !== null) setRecording(null);
        else window.settings.close();
        return;
      }

      if (recording === null) return;
      e.preventDefault();

      if (recording.kind === 'global') {
        const { field } = recording;
        // ⌫ — 이 기능의 단축키를 해제한다. 저장 후 main 은 이 항목을 등록하지 않는다.
        const next = isClearKey(e) ? HOTKEY_DISABLED : toAccelerator(e);
        if (next === null) return;
        setHotkeys((prev) => ({ ...prev, [field]: next }));
      } else {
        const { tool } = recording;
        let next: string;
        if (isClearKey(e)) {
          next = HOTKEY_DISABLED;
        } else {
          // 수식키 조합은 받지 않는다 — 에디터의 ⌘C/⌘Z 같은 명령과 겹치기 때문.
          // 수식키 자체를 누른 keydown(e.code 'ShiftLeft' 등)도 codeToKeyName 이 null 을 준다.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          const keyName = codeToKeyName(e.code);
          if (keyName === null || !isEditorToolKeyName(keyName)) return;
          next = keyName;
        }
        setEditorHotkeys((prev) => ({ ...prev, [tool]: next }));
      }
      setRecording(null);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording]);

  // 녹화 중 다른 앱으로 전환하면 녹화를 끝낸다 — 그대로 두면 창 밖에서 전역 단축키가
  // 해제된 채로 남는다 (main 의 setHotkeyRecording(false) 로 곧바로 복구된다).
  useEffect(() => {
    if (recording === null) return undefined;

    const onBlur = (): void => {
      setRecording(null);
    };

    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [recording]);

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
      window.settings.setMisc(misc),
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
    setHotkeys(DEFAULT);
    setEditorHotkeys(DEFAULT_EDITOR_HOTKEYS);
  };

  const handleClearGlobal = (field: keyof HotkeyConfig): void => {
    setRecording(null);
    setHotkeys((prev) => ({ ...prev, [field]: HOTKEY_DISABLED }));
  };

  const handleClearEditor = (tool: EditorTool): void => {
    setRecording(null);
    setEditorHotkeys((prev) => ({ ...prev, [tool]: HOTKEY_DISABLED }));
  };

  const handlePickFolder = (): void => {
    window.settings.pickFolder().then((picked) => {
      if (picked !== null) {
        setFolderPath(picked);
      }
    }).catch((err: unknown) => {
      console.error('[asis settings] pickFolder failed', err);
    });
  };

  return (
    <div className="settings">
      <h1 className="settings__title">{t.title}</h1>

      {running.length > 0 ? (
        <p className="settings__notice settings__notice--info" role="status">
          {t.runningWarning(running.map((feature) => t.runningFeatureLabels[feature]).join(', '))}
        </p>
      ) : null}

      <section className="settings__section">
        <h2 className="settings__section-title">{t.languageSection}</h2>
        <div className="misc-row">
          <label className="misc-row__label" htmlFor="language">
            {t.languageLabel}
          </label>
          <select
            id="language"
            className="misc-row__select"
            value={lang}
            onChange={(e): void => {
              const next = e.target.value;
              if (!isLanguage(next)) {
                // option 은 ko/en 뿐이라 도달 불가 — 도달하면 코드 버그.
                throw new Error(`unsupported language option: ${next}`);
              }
              // 저장 버튼과 무관하게 즉시 전체 앱(트레이·메뉴·모든 창)에 반영된다.
              window.i18n.setLanguage(next).catch((err: unknown) => {
                console.error('[asis settings] setLanguage failed', err);
              });
            }}
          >
            <option value="ko">{t.languageKo}</option>
            <option value="en">{t.languageEn}</option>
          </select>
        </div>
      </section>

      <section className="settings__section">
        <h2 className="settings__section-title">{t.folderSection}</h2>
        <div className="folder-row">
          <span className="folder-row__path">
            {folderPath || t.folderDefault}
          </span>
          <button type="button" className="btn btn--secondary folder-row__btn" onClick={handlePickFolder}>
            {t.change}
          </button>
        </div>
      </section>

      <section className="settings__section">
        <h2 className="settings__section-title">{t.generalSection}</h2>
        <div className="misc-row">
          <label className="misc-row__label" htmlFor="gifFps">{t.gifFps}</label>
          <select
            id="gifFps"
            className="misc-row__select"
            value={misc.gifFps}
            onChange={(e): void => {
              setMisc((prev) => ({ ...prev, gifFps: Number(e.target.value) }));
            }}
          >
            {[5, 10, 15, 20, 24, 30].map((fps) => (
              <option key={fps} value={fps}>{fps} fps</option>
            ))}
          </select>
        </div>
        <div className="misc-row">
          <label className="misc-row__label" htmlFor="pinOpacity">{t.pinOpacity}</label>
          <input
            id="pinOpacity"
            type="range"
            className="misc-row__range"
            min={15}
            max={100}
            step={5}
            value={Math.round(misc.pinDefaultOpacity * 100)}
            onChange={(e): void => {
              setMisc((prev) => ({ ...prev, pinDefaultOpacity: Number(e.target.value) / 100 }));
            }}
          />
          <span className="misc-row__value">{Math.round(misc.pinDefaultOpacity * 100)}%</span>
        </div>
        <div className="misc-row">
          <label className="misc-row__label misc-row__label--check" htmlFor="captureSound">
            <input
              id="captureSound"
              type="checkbox"
              className="misc-row__check"
              checked={misc.captureSound}
              onChange={(e): void => {
                setMisc((prev) => ({ ...prev, captureSound: e.target.checked }));
              }}
            />
            {t.captureSound}
          </label>
        </div>
        <div className="misc-row">
          <label className="misc-row__label misc-row__label--check" htmlFor="openAtLogin">
            <input
              id="openAtLogin"
              type="checkbox"
              className="misc-row__check"
              checked={misc.openAtLogin}
              onChange={(e): void => {
                setMisc((prev) => ({ ...prev, openAtLogin: e.target.checked }));
              }}
            />
            {t.openAtLogin}
          </label>
        </div>
        <div className="misc-row">
          <label className="misc-row__label" htmlFor="tmBuffer">
            {t.tmBuffer}
          </label>
          <input
            id="tmBuffer"
            type="range"
            className="misc-row__range"
            min={10}
            max={120}
            step={5}
            value={misc.timeMachineBufferSeconds}
            onChange={(e): void => {
              setMisc((prev) => ({
                ...prev,
                timeMachineBufferSeconds: Number(e.target.value),
              }));
            }}
          />
          <span className="misc-row__value">
            {t.seconds(misc.timeMachineBufferSeconds)}
          </span>
        </div>
      </section>

      <section className="settings__section">
        <h2 className="settings__section-title">{t.hotkeySection}</h2>
        <p className="settings__section-hint">{t.hotkeyHint}</p>
        {conflicts.size > 0 ? (
          <p className="settings__notice settings__notice--warn" role="alert">
            {t.conflictWarning([...conflicts].map(toDisplayString).join(', '))}
          </p>
        ) : null}
        <table className="hotkey-table">
          <tbody>
            {HOTKEY_FIELDS.map((field) => {
              const value = hotkeys[field];
              const isRecording = recording?.kind === 'global' && recording.field === field;
              const isDisabled = value === HOTKEY_DISABLED;
              const conflicted = conflicts.has(value);
              return (
                <tr key={field} className="hotkey-row">
                  <td className="hotkey-row__label">{t.hotkeyLabels[field]}</td>
                  <td className="hotkey-row__input">
                    {conflicted ? (
                      <span className="hotkey-row__badge">{t.conflictBadge}</span>
                    ) : null}
                    <button
                      type="button"
                      className={[
                        'hotkey-btn',
                        isRecording ? 'hotkey-btn--recording' : '',
                        conflicted ? 'hotkey-btn--conflict' : '',
                        isDisabled && !isRecording ? 'hotkey-btn--empty' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={(): void => {
                        setRecording(isRecording ? null : { kind: 'global', field });
                      }}
                    >
                      {isRecording
                        ? t.recordingHint
                        : isDisabled ? t.hotkeyNone : toDisplayString(value)}
                    </button>
                    {!isDisabled && !isRecording ? (
                      <button
                        type="button"
                        className="hotkey-row__clear"
                        aria-label={t.clearHotkey}
                        title={t.clearHotkey}
                        onClick={(): void => handleClearGlobal(field)}
                      >
                        ✕
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="settings__section">
        <h2 className="settings__section-title">{t.editorHotkeySection}</h2>
        <p className="settings__section-hint">{t.editorHotkeyHint}</p>
        {editorConflicts.size > 0 ? (
          <p className="settings__notice settings__notice--warn" role="alert">
            {t.editorConflictWarning([...editorConflicts].join(', '))}
          </p>
        ) : null}
        <table className="hotkey-table">
          <tbody>
            {EDITOR_TOOLS.map((tool) => {
              const value = editorHotkeys[tool];
              const isRecording = recording?.kind === 'editor' && recording.tool === tool;
              const isDisabled = value === HOTKEY_DISABLED;
              const conflicted = editorConflicts.has(value);
              return (
                <tr key={tool} className="hotkey-row">
                  <td className="hotkey-row__label">{t.editorToolLabels[tool]}</td>
                  <td className="hotkey-row__input">
                    {conflicted ? (
                      <span className="hotkey-row__badge">{t.conflictBadge}</span>
                    ) : null}
                    <button
                      type="button"
                      className={[
                        'hotkey-btn',
                        isRecording ? 'hotkey-btn--recording' : '',
                        conflicted ? 'hotkey-btn--conflict' : '',
                        isDisabled && !isRecording ? 'hotkey-btn--empty' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={(): void => {
                        setRecording(isRecording ? null : { kind: 'editor', tool });
                      }}
                    >
                      {isRecording
                        ? t.editorRecordingHint
                        : isDisabled ? t.hotkeyNone : value}
                    </button>
                    {!isDisabled && !isRecording ? (
                      <button
                        type="button"
                        className="hotkey-row__clear"
                        aria-label={t.clearHotkey}
                        title={t.clearHotkey}
                        onClick={(): void => handleClearEditor(tool)}
                      >
                        ✕
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="settings__actions">
        <button type="button" className="btn btn--secondary" onClick={handleReset}>
          {t.reset}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSave}
          disabled={hasConflict}
        >
          {t.save}
        </button>
      </div>
    </div>
  );
}
