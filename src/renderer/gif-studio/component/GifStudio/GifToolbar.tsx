import type { JSX } from 'react';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { editorStrings } from '../../../editor/lib/strings';
import { useEditorStore } from '../../../editor/lib/store';
import { addImageFromSource } from '../../../editor/lib/image-utils';
import { useToolbarStyle } from '../../../editor/hook/useToolbarStyle';
import { ColorGroup, ToolGroup, ZoomGroup } from '../../../editor/component/Toolbar/Groups';
import { StylePanel } from '../../../editor/component/Toolbar/StylePanel';
import { ToolbarButton } from '../../../editor/component/Toolbar/Buttons';
import {
  ImageIcon,
  RedoIcon,
  UndoIcon,
} from '../../../editor/component/Toolbar/Icons';

/**
 * 이미지 에디터 툴바를 그대로 쓴다 — 도구(블러·모자이크 포함)·색·스타일·줌 그룹은 editor 의
 * 컴포넌트, 편집 그룹만 GIF 용(핀·폴더 저장 대신 undo/redo·이미지 넣기)으로 다시 묶었다.
 * 저장·복사는 하단 액션 바가 GIF 단위로 한다.
 */
export function GifToolbar({ disabled }: { disabled: boolean }): JSX.Element {
  const style = useToolbarStyle();
  return (
    <div
      className={`toolbar gif-toolbar${disabled ? ' gif-toolbar--disabled' : ''}`}
      aria-disabled={disabled}
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
      <EditGroup />
      <div className="toolbar__divider" aria-hidden="true" />
      <ZoomGroup />
    </div>
  );
}

function EditGroup(): JSX.Element {
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
      <label className="iconbtn" title={t.toolbar.attachImage}>
        <ImageIcon />
        <input
          type="file"
          aria-label={t.toolbar.attachImage}
          accept="image/*"
          multiple
          hidden
          onChange={(e): void => {
            const input = e.currentTarget;
            // files 는 선택 취소 시 null 일 수 있다 (실제 옵셔널).
            const files = Array.from(input.files ?? []);
            // 같은 파일을 다시 고를 수 있게 비운다.
            input.value = '';
            for (const file of files) {
              addImageFromSource(file).catch((err: unknown) => {
                console.error('[asis gif-studio] 이미지 넣기 실패', err);
              });
            }
          }}
        />
      </label>
    </div>
  );
}
