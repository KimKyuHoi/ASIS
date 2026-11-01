import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { DEFAULT_EDITOR_HOTKEYS, type EditorHotkeyConfig } from '../../../shared/editor-hotkeys';
import type { RunningFeature } from '../../../shared/running-features';
import { DEFAULT_HOTKEYS, DEFAULT_MISC } from '../lib/settings-defaults';
import type { HotkeyConfig } from '../types/hotkeys';
import type { MiscConfig } from '../types/misc-config';

type SettingsData = {
  hotkeys: HotkeyConfig;
  setHotkeys: Dispatch<SetStateAction<HotkeyConfig>>;
  editorHotkeys: EditorHotkeyConfig;
  setEditorHotkeys: Dispatch<SetStateAction<EditorHotkeyConfig>>;
  misc: MiscConfig;
  setMisc: Dispatch<SetStateAction<MiscConfig>>;
  folderPath: string;
  setFolderPath: Dispatch<SetStateAction<string>>;
  running: RunningFeature[];
};

/** 저장된 설정을 한 번 불러와 편집용 state 로 둔다. 저장은 부르는 쪽(저장 버튼) 책임. */
export function useSettingsData(): SettingsData {
  const [hotkeys, setHotkeys] = useState<HotkeyConfig>(DEFAULT_HOTKEYS);
  const [editorHotkeys, setEditorHotkeys] = useState<EditorHotkeyConfig>(DEFAULT_EDITOR_HOTKEYS);
  const [misc, setMisc] = useState<MiscConfig>(DEFAULT_MISC);
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

  return {
    hotkeys,
    setHotkeys,
    editorHotkeys,
    setEditorHotkeys,
    misc,
    setMisc,
    folderPath,
    setFolderPath,
    running,
  };
}
