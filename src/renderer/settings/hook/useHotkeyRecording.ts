import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { EditorHotkeyConfig } from '../../../shared/editor-hotkeys';
import { isPlainEscape, nextEditorValue, nextGlobalValue } from '../lib/hotkey-rules';
import type { HotkeyConfig } from '../types/hotkeys';
import type { Recording } from '../types/recording';

type Setters = {
  setHotkeys: Dispatch<SetStateAction<HotkeyConfig>>;
  setEditorHotkeys: Dispatch<SetStateAction<EditorHotkeyConfig>>;
};

/**
 * 단축키 녹화 — 행을 누르면 다음 키 입력을 그 행의 값으로 받는다.
 * ESC: 녹화 중이면 녹화만 취소, 아니면 창을 닫는다. 다른 앱으로 전환하면 녹화를 끝낸다.
 */
export function useHotkeyRecording({ setHotkeys, setEditorHotkeys }: Setters): [
  Recording | null,
  Dispatch<SetStateAction<Recording | null>>,
] {
  const [recording, setRecording] = useState<Recording | null>(null);

  // 녹화 중에는 main 이 전역 단축키(⌘⇧A …)와 앱 메뉴 accelerator(⌘W·⌘A·⌘Z …)를 끈다.
  // 그래야 그 조합들이 기능을 실행하지 않고 순수 키 입력으로 들어온다.
  // 에디터 도구 키 녹화는 수식키가 없어 사실상 무관하지만, 같은 경로를 타도 해가 없다.
  useEffect(() => {
    window.settings.setHotkeyRecording(recording !== null);
  }, [recording]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isPlainEscape(e)) {
        e.preventDefault();
        if (recording !== null) setRecording(null);
        else window.settings.close();
        return;
      }

      if (recording === null) return;
      e.preventDefault();

      if (recording.kind === 'global') {
        const next = nextGlobalValue(e);
        if (next === null) return;
        const { field } = recording;
        setHotkeys((prev) => ({ ...prev, [field]: next }));
      } else {
        const next = nextEditorValue(e);
        if (next === null) return;
        const { tool } = recording;
        setEditorHotkeys((prev) => ({ ...prev, [tool]: next }));
      }
      setRecording(null);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, setHotkeys, setEditorHotkeys]);

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

  return [recording, setRecording];
}
