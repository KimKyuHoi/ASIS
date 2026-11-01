import { useRef, useState, type JSX } from 'react';
import type Konva from 'konva';
import { Toast } from '../../../design-system/component';
import { useEditorStore } from '../../lib/store';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { editorStrings } from '../../lib/strings';
import { cancelEditor } from '../../lib/editor-actions';
import { addImageFromSource } from '../../lib/image-utils';
import { useEditorImages } from '../../hook/useEditorImages';
import { useEditorKeyboard } from '../../hook/useEditorKeyboard';
import { useEditorDrag } from '../../hook/useEditorDrag';
import { useStageScale, useWheelZoom } from '../../hook/useStageZoom';
import { useStageWrapFocus } from '../../hook/useStageWrapFocus';
import { useContextMenu } from '../../hook/useContextMenu';
import { useEditorExport } from '../../hook/useEditorExport';
import { Toolbar } from '../Toolbar';
import { ContextMenu } from './ContextMenu';
import { StageView } from './StageView';
import { CropBar } from './CropBar';

/** 툴바 파일 선택 — 이미지 파일만 골라 캔버스 중앙에 추가. */
function addPickedImages(files: FileList): void {
  Array.from(files)
    .filter((f) => f.type.startsWith('image/'))
    .forEach((f) => {
      addImageFromSource(f).catch((err: unknown) => console.error('[asis editor] picker 실패', err));
    });
}

/**
 * 어노테이션 에디터 메인.
 *
 * 흐름
 *   1) main 이 mount 후 캡처 data URL + 논리 크기 전송 (preload IPC → ipc-init → store)
 *   2) HTMLImageElement 로 로드해서 Konva Stage 의 background 에 배치
 *   3) 사용자 도구 선택 + 마우스 드래그 → 도형 생성 (useStagePointer)
 *   4) ⌘C / "복사" → 원본 픽셀 export → main 이 클립보드 복사 → 윈도우 닫음
 *   5) ESC / ⌘W / "취소" → main 이 윈도우 닫음
 *
 * 룰 적용
 *   - react-compiler.md   useMemo/useCallback/memo 미사용 (Compiler 자동).
 *   - null-safety.md      window.editor 미존재 시 throw.
 *   - side-effects.md     keyboard listener 는 window 단위 useEffect cleanup.
 *                         도형/도구 상태는 zustand store.
 *   - imperative-style.md 이벤트 핸들러 안 명령형 OK. 렌더 path declarative.
 */
export default function Editor(): JSX.Element {
  const t = editorStrings[useLanguage()];
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // stage-wrap div — TextEditor portal 의 target + keydown focus 회복용.
  // callback ref + useState 로 mount 후 자동 re-render 트리거.
  const [stageWrap, setStageWrap] = useState<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useContextMenu();
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);

  const { bgImage, stageScale: fitScale } = useEditorImages(containerRef);
  const stageScale = useStageScale(fitScale);
  const exp = useEditorExport(stageRef, bgImage);
  // Stage 는 이미지 로드 후에야 렌더된다 — 그 시점에 다중 선택 drag 리스너를 붙인다.
  useEditorDrag(stageRef, bgImage !== null && imageWidth > 0 && imageHeight > 0);
  useEditorKeyboard(stageRef, {
    pixelRatio: exp.exportPixelRatio,
    bgImage,
  });
  useWheelZoom(containerRef, stageWrap, stageScale);
  useStageWrapFocus(stageWrap, bgImage);

  return (
    <div className="editor">
      {/* 상단 창 이동 손잡이 — hiddenInset 타이틀바 자리. */}
      <div className="editor__titlebar" />
      {exp.saveNotice !== null && (
        <div className="editor__toast">
          {exp.saveNotice.kind === 'saved' ? (
            <Toast tone="success" title={t.editor.savedTitle} description={exp.saveNotice.path} />
          ) : (
            <Toast tone="danger" title={t.editor.saveFailedTitle} description={t.editor.saveFailedHint} />
          )}
        </div>
      )}
      {bgImage ? <CropBar bgImage={bgImage} /> : null}
      {contextMenu !== null && (
        <ContextMenu menu={contextMenu} onClose={(): void => setContextMenu(null)} />
      )}
      <div className="editor__canvas" ref={containerRef}>
        {bgImage && imageWidth > 0 && imageHeight > 0 ? (
          <StageView
            stageRef={stageRef}
            transformerRef={transformerRef}
            bgImage={bgImage}
            stageScale={stageScale}
            stageWrap={stageWrap}
            setStageWrap={setStageWrap}
            onShapeContextMenu={setContextMenu}
          />
        ) : (
          <div className="editor__empty">{t.editor.loading}</div>
        )}
      </div>
      <Toolbar
        onCopy={exp.onCopy}
        onCancel={cancelEditor}
        onPin={exp.onPin}
        onSaveFolder={exp.onSaveFolder}
        onImageFiles={addPickedImages}
      />
    </div>
  );
}
