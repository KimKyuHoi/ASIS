import { useRef, useState, type JSX } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '../../../editor/lib/store';
import { useEditorImages } from '../../../editor/hook/useEditorImages';
import { useEditorDrag } from '../../../editor/hook/useEditorDrag';
import { useStageScale, useWheelZoom } from '../../../editor/hook/useStageZoom';
import { useStageWrapFocus } from '../../../editor/hook/useStageWrapFocus';
import { useContextMenu } from '../../../editor/hook/useContextMenu';
import { StageView } from '../../../editor/component/Editor/StageView';
import { ContextMenu } from '../../../editor/component/Editor/ContextMenu';

/**
 * 단계 이미지 한 장을 이미지 에디터 그대로 편집한다 — editor 의 StageView(배경·도형·포인터·
 * 텍스트 편집·드롭)와 줌·다중 drag·우클릭 메뉴 훅을 import 해 조립한다(GIF 스튜디오
 * FrameEditor 와 같은 구성). 단계마다 다른 배경·도형은 lib/step-annotations 가 store 에 넣는다.
 */
export default function StepCanvas({ loadingText }: { loadingText: string }): JSX.Element {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stageWrap, setStageWrap] = useState<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useContextMenu();
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);

  const { bgImage, stageScale: fitScale } = useEditorImages(containerRef);
  const stageScale = useStageScale(fitScale);
  const ready = bgImage !== null && imageWidth > 0 && imageHeight > 0;
  useEditorDrag(stageRef, ready);
  useWheelZoom(containerRef, stageWrap, stageScale);
  useStageWrapFocus(stageWrap, bgImage);

  return (
    <div className="editor__canvas ge-canvas" ref={containerRef}>
      {contextMenu === null ? null : (
        <ContextMenu menu={contextMenu} onClose={(): void => setContextMenu(null)} />
      )}
      {ready ? (
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
        <div className="ge-canvas__loading">{loadingText}</div>
      )}
    </div>
  );
}
