import { useEditorStore } from '../../editor/lib/store';
import { useContextMenu, type ContextMenuState } from '../../editor/hook/useContextMenu';

export type CloseFlow = {
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;
  /** [닫기]·ESC 마지막 단계 — 창을 닫는다. 저장하지 않은 편집 확인은 main 의 시트가 한다. */
  requestClose: () => void;
  /**
   * ESC 한 번 = 가장 위의 동작 하나만 끝낸다. 끝낼 것이 없을 때만 창을 닫는다.
   * 순서: 우클릭 메뉴 → 그리던 도형·영역 선택 → 도형 선택 → 창 닫기.
   * (텍스트 편집 취소는 에디터 TextEditor 가 textarea 에서 먼저 처리한다.)
   */
  escape: () => void;
};

/**
 * GIF 스튜디오 창 닫기 — ESC 단계 처리.
 * 저장하지 않은 편집이 있으면 렌더러 beforeunload(lib/frame-docs)가 닫기를 막고 main 이
 * "저장하지 않고 닫기 / 취소" 시트를 띄운다 — 빨간 닫기 버튼도 같은 확인을 거친다.
 */
export function useCloseFlow(): CloseFlow {
  const [contextMenu, setContextMenu] = useContextMenu();
  const requestClose = (): void => window.gifStudio.close();

  const escape = (): void => {
    const st = useEditorStore.getState();
    if (contextMenu !== null) setContextMenu(null);
    else if (st.drawing !== null || st.marquee !== null) {
      st.cancelDrawing();
      st.setMarquee(null);
    } else if (st.selectedIds.length > 0) st.selectShape(null);
    else requestClose();
  };

  return { contextMenu, setContextMenu, requestClose, escape };
}
