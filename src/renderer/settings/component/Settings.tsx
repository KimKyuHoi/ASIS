import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { toAccelerator, toDisplayString } from '../lib/keyboard-utils';

type HotkeyConfig = {
  region: string;
  fullscreen: string;
  window: string;
  delayedFullscreen: string;
  delayedRegion: string;
  disableClickThrough: string;
  gif: string;
  clipboardPin: string;
};

type MiscConfig = {
  gifFps: number;
  openAtLogin: boolean;
  captureSound: boolean;
  pinDefaultOpacity: number;
  delayedCaptureSeconds: number;
  autoOpenEditor: boolean;
};

// 기본값은 src/main/settings.ts 의 DEFAULT_MISC 와 동일하게 유지한다.
const DEFAULT_MISC: MiscConfig = {
  gifFps: 15,
  openAtLogin: false,
  captureSound: true,
  pinDefaultOpacity: 1.0,
  delayedCaptureSeconds: 3,
  autoOpenEditor: true,
};

const DEFAULT: HotkeyConfig = {
  region: 'CommandOrControl+Shift+A',
  fullscreen: 'CommandOrControl+Shift+F',
  window: 'CommandOrControl+Shift+W',
  delayedFullscreen: 'CommandOrControl+Shift+D',
  delayedRegion: 'CommandOrControl+Shift+Alt+D',
  disableClickThrough: 'CommandOrControl+Shift+X',
  gif: 'CommandOrControl+Shift+G',
  clipboardPin: 'CommandOrControl+Shift+V',
};

const LABELS: Record<keyof HotkeyConfig, string> = {
  region: '영역 캡처',
  fullscreen: '전체 화면 캡처',
  window: '윈도우 캡처',
  delayedFullscreen: '지연 전체화면 캡처 (3초)',
  delayedRegion: '지연 영역 캡처 (3초)',
  disableClickThrough: '클릭 통과 해제',
  gif: 'GIF 녹화',
  clipboardPin: '클립보드 핀',
};

const HOTKEY_FIELDS: Array<keyof HotkeyConfig> = [
  'region',
  'fullscreen',
  'window',
  'delayedFullscreen',
  'delayedRegion',
  'disableClickThrough',
  'gif',
  'clipboardPin',
];

export default function Settings(): JSX.Element {
  const [hotkeys, setHotkeys] = useState<HotkeyConfig>(DEFAULT);
  const [misc, setMisc] = useState<MiscConfig>(DEFAULT_MISC);
  const [recording, setRecording] = useState<keyof HotkeyConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [folderPath, setFolderPath] = useState<string>('');

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

  useEffect(() => {
    if (!recording) return undefined;

    const onKey = (e: KeyboardEvent): void => {
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

  const handleSave = (): void => {
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
      <h1 className="settings__title">환경설정</h1>

      <section className="settings__section">
        <h2 className="settings__section-title">저장 위치</h2>
        <div className="folder-row">
          <span className="folder-row__path">
            {folderPath || '기본값 (~/Pictures/ASIS)'}
          </span>
          <button type="button" className="btn btn--secondary folder-row__btn" onClick={handlePickFolder}>
            변경…
          </button>
        </div>
      </section>

      <section className="settings__section">
        <h2 className="settings__section-title">일반</h2>
        <div className="misc-row">
          <label className="misc-row__label" htmlFor="gifFps">GIF 프레임 속도</label>
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
          <label className="misc-row__label" htmlFor="pinOpacity">핀 기본 투명도</label>
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
            캡처 완료 소리
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
            로그인 시 자동 시작
          </label>
        </div>
      </section>

      <section className="settings__section">
        <h2 className="settings__section-title">단축키</h2>
        <table className="hotkey-table">
          <tbody>
            {HOTKEY_FIELDS.map((field) => (
              <tr key={field} className="hotkey-row">
                <td className="hotkey-row__label">{LABELS[field]}</td>
                <td className="hotkey-row__input">
                  <button
                    type="button"
                    className={`hotkey-btn ${recording === field ? 'hotkey-btn--recording' : ''}`}
                    onClick={(): void => {
                      setRecording(recording === field ? null : field);
                    }}
                  >
                    {recording === field
                      ? '단축키 누르기…'
                      : toDisplayString(hotkeys[field])}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="settings__actions">
        <button type="button" className="btn btn--secondary" onClick={handleReset}>
          기본값으로
        </button>
        <button type="button" className="btn btn--primary" onClick={handleSave}>
          {saved ? '저장됨 ✓' : '저장'}
        </button>
      </div>
    </div>
  );
}
