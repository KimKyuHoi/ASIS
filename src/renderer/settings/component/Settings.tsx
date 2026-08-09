import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { isLanguage } from '../../../shared/i18n/language';
import type { RunningFeature } from '../../../shared/running-features';
import { useLanguage } from '../../../shared/i18n/use-language';
import { toAccelerator, toDisplayString } from '../lib/keyboard-utils';
import { settingsStrings } from '../lib/strings';

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

export default function Settings(): JSX.Element {
  const lang = useLanguage();
  const t = settingsStrings[lang];
  const [hotkeys, setHotkeys] = useState<HotkeyConfig>(DEFAULT);
  const [misc, setMisc] = useState<MiscConfig>(DEFAULT_MISC);
  const [recording, setRecording] = useState<keyof HotkeyConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [folderPath, setFolderPath] = useState<string>('');
  const [running, setRunning] = useState<RunningFeature[]>([]);

  useEffect(() => {
    window.settings.get().then((cfg) => {
      setHotkeys(cfg);
    }).catch((err: unknown) => {
      console.error('[asis settings] get failed', err);
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
      const accelerator = toAccelerator(e);
      if (!accelerator) return;
      setHotkeys((prev) => ({ ...prev, [recording]: accelerator }));
      setRecording(null);
      setSaved(false);
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
  // 실패 시 이미 등록한 것까지 전부 해제하고 throw 한다(main/shortcuts.ts:90).
  // 저장 전에 막아야 "모든 단축키가 죽는" 상태를 피할 수 있다.
  const acceleratorCounts = new Map<string, number>();
  for (const field of HOTKEY_FIELDS) {
    const accelerator = hotkeys[field];
    acceleratorCounts.set(accelerator, (acceleratorCounts.get(accelerator) ?? 0) + 1);
  }
  const conflicts = new Set(
    [...acceleratorCounts].filter(([, count]) => count > 1).map(([accelerator]) => accelerator),
  );

  const handleSave = (): void => {
    // 버튼이 disabled 지만 한 번 더 막는다 — 중복 저장은 전역 단축키 전체 해제로 이어진다.
    if (conflicts.size > 0) return;

    Promise.all([
      window.settings.set(hotkeys),
      window.settings.setMisc(misc),
    ]).then(() => {
      setSaved(true);
    }).catch((err: unknown) => {
      console.error('[asis settings] save failed', err);
    });
  };

  const handleReset = (): void => {
    // 녹화 중에 눌러도 기본값이 남도록 녹화를 먼저 끈다 —
    // 안 그러면 다음 키 입력이 방금 되돌린 값을 곧바로 덮어쓴다.
    setRecording(null);
    setHotkeys(DEFAULT);
    setSaved(false);
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
              setSaved(false);
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
              setSaved(false);
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
                setSaved(false);
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
                setSaved(false);
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
              setSaved(false);
            }}
          />
          <span className="misc-row__value">
            {t.seconds(misc.timeMachineBufferSeconds)}
          </span>
        </div>
      </section>

      <section className="settings__section">
        <h2 className="settings__section-title">{t.hotkeySection}</h2>
        {conflicts.size > 0 ? (
          <p className="settings__notice settings__notice--warn" role="alert">
            {t.conflictWarning([...conflicts].map(toDisplayString).join(', '))}
          </p>
        ) : null}
        <table className="hotkey-table">
          <tbody>
            {HOTKEY_FIELDS.map((field) => {
              const conflicted = conflicts.has(hotkeys[field]);
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
                        recording === field ? 'hotkey-btn--recording' : '',
                        conflicted ? 'hotkey-btn--conflict' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={(): void => {
                        setRecording(recording === field ? null : field);
                      }}
                    >
                      {recording === field
                        ? t.recordingHint
                        : toDisplayString(hotkeys[field])}
                    </button>
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
          disabled={conflicts.size > 0}
        >
          {saved ? t.saved : t.save}
        </button>
      </div>
    </div>
  );
}
