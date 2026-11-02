import { useEffect } from 'react';
import { useEditorStore } from '../lib/store';

/**
 * stage-wrap 포커스 유지 — 에디터 단축키(keydown)가 항상 잡히도록.
 *
 * - bgImage 마운트 후 자동 focus — 처음 캡처 뜬 직후 단축키 즉시 동작.
 * - 어떤 mouseup 이든 끝난 직후 focus 회복. 단 textarea 편집 중, toolbar 안의 요소,
 *   혹은 어디에 있든 폼 컨트롤(<select>/<input>/<textarea>)에 포커스가 있을 때는 건너뜀 —
 *   macOS Electron native <select> 팝업이 focus 탈취로 닫히고, 숫자 입력칸에 타이핑할 수 없게 된다.
 *   (GIF 스튜디오 내보내기 패널처럼 툴바 밖에 있는 폼도 같은 문제가 있었다.)
 */

const FORM_CONTROL = 'select, input, textarea, [contenteditable="true"]';
export function useStageWrapFocus(
  stageWrap: HTMLDivElement | null,
  bgImage: HTMLImageElement | null,
): void {
  useEffect(() => {
    if (bgImage && stageWrap) {
      stageWrap.focus();
    }
  }, [bgImage, stageWrap]);

  useEffect(() => {
    if (!stageWrap) return undefined;
    const onUp = (): void => {
      if (useEditorStore.getState().editingId !== null) return;
      const active = document.activeElement;
      if (active === stageWrap) return;
      // toolbar 안의 포커서블 요소(<select>, <input type="color"> 등) 에 포커스가
      // 있으면 가져오지 않는다 — native select 팝업이 살아있는 동안 focus 를 빼앗으면
      // 팝업이 강제로 닫힌다. (activeElement 는 문서에 포커스가 없으면 null)
      if (active?.closest('.toolbar') || active?.matches(FORM_CONTROL)) return;
      stageWrap.focus();
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, [stageWrap]);
}
