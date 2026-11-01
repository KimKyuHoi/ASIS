import type { JSX } from 'react';
import { EDITOR_TOOLS } from '../../../../shared/editor-hotkeys';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { editorStrings } from '../../lib/strings';
import { PALETTE, ZOOM_MAX, ZOOM_MIN, useEditorStore } from '../../lib/store';
import { useEditorHotkeys } from '../../hook/useEditorHotkeys';
import type { ToolbarStyle } from '../../hook/useToolbarStyle';
import { ToolButton, ToolbarButton } from './Buttons';
import {
  CropIcon,
  ImageIcon,
  PinIcon,
  RedoIcon,
  SaveFolderIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './Icons';

const ZOOM_STEP = 1.25;

// 도구 목록·순서는 shared/editor-hotkeys.ts 의 EDITOR_TOOLS, 라벨은 lib/strings.ts 의
// tool 사전, 단축키 표기는 환경설정 값(useEditorHotkeys)이 담당한다.
export function ToolGroup(): JSX.Element {
  const t = editorStrings[useLanguage()];
  const hotkeys = useEditorHotkeys();
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  return (
    <div className="toolbar__group">
      {EDITOR_TOOLS.map((item) => (
        <ToolButton
          key={item}
          label={t.tool[item]}
          shortcut={hotkeys[item]}
          active={tool === item}
          onClick={(): void => setTool(item)}
        />
      ))}
    </div>
  );
}

export function ColorGroup({ style }: { style: ToolbarStyle }): JSX.Element {
  const t = editorStrings[useLanguage()];
  return (
    <div className="toolbar__group toolbar__group--colors">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          className={`color ${style.color === c ? 'color--active' : ''}`}
          style={{ background: c }}
          onClick={(): void => style.setColor(c)}
          aria-label={t.toolbar.colorLabel(c)}
        />
      ))}
      <label className="color color--custom" title={t.toolbar.customColor}>
        <input
          type="color"
          value={style.color}
          onChange={(e): void => style.setColor(e.target.value)}
        />
      </label>
    </div>
  );
}

/** 자르기 · undo/redo · 이미지 첨부 · 핀 · 폴더 저장. */
export function EditGroup({
  onImageFiles,
  onPin,
  onSaveFolder,
}: {
  onImageFiles: (files: FileList) => void;
  onPin: () => void;
  onSaveFolder: () => void;
}): JSX.Element {
  const t = editorStrings[useLanguage()];
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const cropping = useEditorStore((s) => s.cropping);
  const startCrop = useEditorStore((s) => s.startCrop);
  const cancelCrop = useEditorStore((s) => s.cancelCrop);
  return (
    <div className="toolbar__group">
      <button
        type="button"
        className={`iconbtn ${cropping ? 'iconbtn--active' : ''}`}
        onClick={cropping ? cancelCrop : startCrop}
        aria-label={t.toolbar.crop}
        aria-pressed={cropping}
        title={t.toolbar.crop}
      >
        <CropIcon />
      </button>
      <ToolbarButton label={t.toolbar.undo} shortcut="⌘Z" disabled={!canUndo} onClick={undo}>
        <UndoIcon />
      </ToolbarButton>
      <ToolbarButton label={t.toolbar.redo} shortcut="⌘⇧Z" disabled={!canRedo} onClick={redo}>
        <RedoIcon />
      </ToolbarButton>
      {/* 크롭 중에는 첨부도 막는다: ⌘V 붙여넣기를 막는 것과 같은 이유(영역 밖에 붙는 혼란). */}
      <label className="iconbtn" title={t.toolbar.attachImage} aria-disabled={cropping}>
        <ImageIcon />
        <input
          type="file"
          aria-label={t.toolbar.attachImage}
          disabled={cropping}
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e): void => {
            const input = e.target;
            if (input.files && input.files.length > 0) onImageFiles(input.files);
            // 같은 파일 재선택 가능하도록 reset.
            input.value = '';
          }}
        />
      </label>
      <button
        type="button"
        className="iconbtn"
        onClick={onPin}
        disabled={cropping}
        aria-label={t.toolbar.pin}
        title={t.toolbar.pin}
      >
        <PinIcon />
      </button>
      <button
        type="button"
        className="iconbtn"
        onClick={onSaveFolder}
        disabled={cropping}
        aria-label={t.toolbar.saveFolder}
        title={t.toolbar.saveFolder}
      >
        <SaveFolderIcon />
      </button>
    </div>
  );
}

export function ZoomGroup(): JSX.Element {
  const t = editorStrings[useLanguage()];
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  return (
    <div className="toolbar__group">
      <button
        type="button"
        className="iconbtn"
        onClick={(): void => setZoom(zoom / ZOOM_STEP)}
        disabled={zoom <= ZOOM_MIN}
        aria-label={t.toolbar.zoomOut}
        title={t.toolbar.zoomOut}
      >
        <ZoomOutIcon />
      </button>
      <button
        type="button"
        className="iconbtn zoom-pct"
        onClick={(): void => setZoom(1)}
        aria-label={t.toolbar.zoomReset}
        title={t.toolbar.zoomReset}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="iconbtn"
        onClick={(): void => setZoom(zoom * ZOOM_STEP)}
        disabled={zoom >= ZOOM_MAX}
        aria-label={t.toolbar.zoomIn}
        title={t.toolbar.zoomIn}
      >
        <ZoomInIcon />
      </button>
    </div>
  );
}
