import type { JSX } from 'react';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { editorStrings } from '../../../editor/lib/strings';
import { useEditorStore } from '../../../editor/lib/store';
import { useToolbarStyle } from '../../../editor/hook/useToolbarStyle';
import { ColorGroup, ToolGroup, ZoomGroup } from '../../../editor/component/Toolbar/Groups';
import { StylePanel } from '../../../editor/component/Toolbar/StylePanel';
import { ToolbarButton } from '../../../editor/component/Toolbar/Buttons';
import { RedoIcon, UndoIcon } from '../../../editor/component/Toolbar/Icons';

/**
 * 이미지 에디터 툴바를 그대로 쓴다 — 도구(사각형·원·화살표·직선·펜·텍스트·번호·하이라이트·
 * 블러·모자이크·지우개)·색·스타일(두께·선 모양·글꼴)·줌 그룹은 editor 의 컴포넌트.
 * 편집 그룹만 undo/redo 로 다시 묶었다(핀·저장·복사는 편집 창 [저장…]이 문서 단위로 한다).
 */
export default function StepToolbar(): JSX.Element {
  const style = useToolbarStyle();
  return (
    <div
      className="toolbar ge-toolbar"
      onMouseDown={(e): void => {
        // editor Toolbar 와 같은 이유 — TextEditor 의 window mousedown 이 툴바 클릭을
        // 바깥 클릭으로 오인해 편집을 끝내지 않게.
        e.nativeEvent.stopImmediatePropagation();
      }}
    >
      <ToolGroup />
      <div className="toolbar__divider" aria-hidden="true" />
      <ColorGroup style={style} />
      <div className="toolbar__divider" aria-hidden="true" />
      <StylePanel style={style} />
      <div className="toolbar__divider" aria-hidden="true" />
      <HistoryGroup />
      <div className="toolbar__divider" aria-hidden="true" />
      <ZoomGroup />
    </div>
  );
}

function HistoryGroup(): JSX.Element {
  const t = editorStrings[useLanguage()];
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  return (
    <div className="toolbar__group">
      <ToolbarButton label={t.toolbar.undo} shortcut="⌘Z" disabled={!canUndo} onClick={undo}>
        <UndoIcon />
      </ToolbarButton>
      <ToolbarButton label={t.toolbar.redo} shortcut="⌘⇧Z" disabled={!canRedo} onClick={redo}>
        <RedoIcon />
      </ToolbarButton>
    </div>
  );
}
