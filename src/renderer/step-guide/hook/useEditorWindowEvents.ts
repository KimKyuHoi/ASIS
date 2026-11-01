import { useEffect } from 'react';

/** main 이 읽는 미저장 표시 이름 — stepGuideEditorWindow.ts 의 DIRTY_FLAG 와 같아야 한다. */
const DIRTY_FLAG = 'asisGuideEditorDirty';

/**
 * 편집 창 전역 이벤트 — ⌘S 저장, 미저장 표시를 main 에 노출.
 *
 * side-effects.md — window 이벤트·전역 값을 React state(dirty)·핸들러(onSave)와
 * 동기화하는 자리라 useEffect.
 */
export function useEditorWindowEvents(dirty: boolean, onSave: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // 물리 키(code)로 판정 — 한글 입력 상태에서는 key 가 's' 가 아닐 수 있다(에디터 단축키와 같은 규칙).
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyS') {
        event.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onSave]);

  useEffect(() => {
    // main(stepGuideEditorWindow)이 창을 닫기 전에 executeJavaScript 로 이 값을 읽어
    // "저장하지 않고 닫기" 확인 여부를 정한다. beforeunload 는 한 번 취소된 뒤 Chromium 이
    // 재시도를 진행하지 않는 경우가 있어 쓰지 않는다.
    Reflect.set(window, DIRTY_FLAG, dirty);
  }, [dirty]);
}
