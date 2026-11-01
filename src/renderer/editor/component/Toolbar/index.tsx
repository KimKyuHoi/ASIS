import type { JSX } from 'react';
import { Button } from '../../../design-system/component';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { editorStrings } from '../../lib/strings';
import { useToolbarStyle } from '../../hook/useToolbarStyle';
import { useEditorStore } from '../../lib/store';
import { ColorGroup, EditGroup, ToolGroup, ZoomGroup } from './Groups';
import { StylePanel } from './StylePanel';

export function Toolbar({
  onCopy,
  onCancel,
  onImageFiles,
  onPin,
  onSaveFolder,
}: {
  onCopy: () => void;
  onCancel: () => void;
  onImageFiles: (files: FileList) => void;
  onPin: () => void;
  onSaveFolder: () => void;
}): JSX.Element {
  const t = editorStrings[useLanguage()];
  const style = useToolbarStyle();
  // 크롭 중에는 내보내기를 막는다 — 잘리기 전 이미지가 나간다 (키보드 ⌘C/⌘S 도 같은 이유로 막음).
  const cropping = useEditorStore((s) => s.cropping);
  return (
    <div
      className="toolbar"
      onMouseDown={(e): void => {
        // TextEditor의 window mousedown 리스너가 toolbar 클릭을 외부 클릭으로 오인해
        // 편집 모드를 종료하지 않도록 native 이벤트 전파를 차단한다.
        // Chromium custom select popup이 DOM 트리 밖에 렌더링되어 .toolbar 체크를
        // 우회하는 경우도 함께 방어한다.
        e.nativeEvent.stopImmediatePropagation();
      }}
    >
      <ToolGroup />
      <div className="toolbar__divider" aria-hidden="true" />
      <ColorGroup style={style} />
      <div className="toolbar__divider" aria-hidden="true" />
      <StylePanel style={style} />
      <div className="toolbar__divider" aria-hidden="true" />
      <EditGroup
        onImageFiles={onImageFiles}
        onPin={onPin}
        onSaveFolder={onSaveFolder}
      />
      <div className="toolbar__divider" aria-hidden="true" />
      <ZoomGroup />
      <div className="toolbar__spacer" />
      <div className="toolbar__group toolbar__group--actions">
        <Button variant="secondary" onClick={onCancel}>
          {t.toolbar.cancel}
        </Button>
        <Button variant="primary" onClick={onCopy} disabled={cropping}>
          {t.toolbar.copy}
          <span className="action__hint">⌘C</span>
        </Button>
      </div>
    </div>
  );
}
