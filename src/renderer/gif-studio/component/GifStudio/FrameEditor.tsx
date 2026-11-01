import { useRef, useState, type JSX } from 'react';
import type Konva from 'konva';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { useEditorStore } from '../../../editor/lib/store';
import { useEditorImages } from '../../../editor/hook/useEditorImages';
import { useEditorDrag } from '../../../editor/hook/useEditorDrag';
import { useStageScale, useWheelZoom } from '../../../editor/hook/useStageZoom';
import { useStageWrapFocus } from '../../../editor/hook/useStageWrapFocus';
import type { ContextMenuState } from '../../../editor/hook/useContextMenu';
import { StageView } from '../../../editor/component/Editor/StageView';
import { ContextMenu } from '../../../editor/component/Editor/ContextMenu';
import { gifStudioStrings } from '../../lib/strings';

/**
 * 프레임 한 장을 이미지 에디터 그대로 편집한다 — editor 의 StageView(배경·도형·포인터·
 * 텍스트 편집·드롭)와 줌·다중 drag·우클릭 메뉴 훅을 import 해서 조립한다.
 * 배경은 hook/useFrameBackground 가 이 프레임 정지화면으로 채운 imageSrc.
 * 프레임마다 다른 것은 에디터 store 의 도형뿐이다 (lib/frame-docs 가 바꿔 끼운다).
 */
export function FrameEditor({
  contextMenu,
  setContextMenu,
}: {
  /** 우클릭 메뉴 — ESC 로도 닫도록 상위(useCloseFlow)가 상태를 가진다. */
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;
}): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stageWrap, setStageWrap] = useState<HTMLDivElement | null>(null);
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);

  const { bgImage, stageScale: fitScale } = useEditorImages(containerRef);
  const stageScale = useStageScale(fitScale);
  useEditorDrag(stageRef, bgImage !== null && imageWidth > 0 && imageHeight > 0);
  useWheelZoom(containerRef, stageWrap, stageScale);
  useStageWrapFocus(stageWrap, bgImage);

  return (
    <div className="editor__canvas frame-editor" ref={containerRef}>
      {contextMenu === null ? null : (
        <ContextMenu menu={contextMenu} onClose={(): void => setContextMenu(null)} />
      )}
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
        <div className="frame-editor__loading">{t.loadingFrame}</div>
      )}
    </div>
  );
}
