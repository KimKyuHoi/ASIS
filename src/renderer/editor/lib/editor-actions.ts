import type Konva from 'konva';
import { useEditorStore } from './store';
import { EDIT_HANDLE_NAME } from './edit-ui';
import { snapshotProject } from './editor-project';

/**
 * 줌 시각 보정 노드(name="zoom-comp")의 stroke·화살표 머리를 base 값 × factor 로
 * 설정한다. factor=1 이면 원본(이미지 픽셀) 두께, factor=1/effectiveZoom 이면 화면 보정 두께.
 * base attr 가 없는 노드는 건드리지 않는다 (silent fallback 아님 — 보정 대상만 마킹됨).
 */
function applyZoomComp(stage: Konva.Stage, factor: number): void {
  stage.find('.zoom-comp').forEach((n) => {
    const node = n as Konva.Shape;
    const baseStrokeWidth = node.getAttr('baseStrokeWidth') as number | undefined;
    if (baseStrokeWidth !== undefined) {
      node.strokeWidth(baseStrokeWidth * factor);
    }
    const basePointer = node.getAttr('basePointer') as number | undefined;
    if (basePointer !== undefined) {
      (node as Konva.Arrow).pointerLength(basePointer * factor);
      (node as Konva.Arrow).pointerWidth(basePointer * factor);
    }
    const baseDash = node.getAttr('baseDash') as number[] | undefined;
    if (baseDash !== undefined) {
      node.dash(baseDash.map((d) => d * factor));
    }
  });
}

/**
 * 편집 UI(Transformer·끝점 핸들)를 숨기고, 줌 시각 보정(1/effectiveZoom 두께)을 원본 두께로 되돌린 채
 * 캡처 원본 해상도로 export 한 뒤 즉시 복원한다.
 * - 편집 UI 숨김: Transformer 앵커박스·arrow/line 끝점 핸들(EDIT_HANDLE_NAME)이
 *   export 이미지에 포함되는 것 방지.
 * - 두께 복원: 화면에서는 줌과 무관하게 일정 두께로 보이지만(Shape 의 vw 보정),
 *   export 는 데이터의 이미지 픽셀 두께 그대로 — 줌 상태와 무관한 결과 보장.
 * - Stage scale 1 고정: 화면 fit 배율(stageScale)을 둔 채 pixelRatio=dpr/stageScale 로
 *   export 하면 Stage._toKonvaCanvas 가 비정수 크기의 레이어 캔버스를 만들고(정수로
 *   잘림) 그것을 다시 drawImage 로 미세 스케일 합성한다 — 이중 리샘플링으로 흐려지고
 *   오른쪽 1px 가 잘린다 (3456 원본 → 3455, 1px 패턴 소실 실측). scale 1 + 이미지 논리
 *   크기 rect + 정수 비율이면 레이어·Stage 캔버스가 모두 원본 픽셀 크기와 일치한다.
 *
 * Konva.toDataURL 은 오프스크린 캔버스에 씬을 재렌더하고, 이 함수는 동기적으로 원상
 * 복구하므로 화면에는 scale 변경이 그려지지 않는다.
 *
 * @param pixelRatio 이미지 논리 크기 → 원본 픽셀 배율 (bgImage.naturalWidth / imageWidth).
 */
export function stageToDataUrl(stage: Konva.Stage, pixelRatio: number): string {
  if (!(pixelRatio > 0)) {
    throw new Error(`stageToDataUrl: invalid pixelRatio ${String(pixelRatio)}`);
  }
  const { effectiveZoom, imageWidth, imageHeight } = useEditorStore.getState();
  // 편집 UI(Transformer·끝점 핸들)는 export 에서 제외.
  const editUi = [...stage.find('Transformer'), ...stage.find(`.${EDIT_HANDLE_NAME}`)];
  editUi.forEach((n) => n.hide());
  const prevScale = stage.scale();
  stage.scale({ x: 1, y: 1 });
  applyZoomComp(stage, 1);
  try {
    return stage.toDataURL({
      x: 0,
      y: 0,
      width: imageWidth,
      height: imageHeight,
      pixelRatio,
    });
  } finally {
    stage.scale(prevScale);
    applyZoomComp(stage, 1 / effectiveZoom);
    editUi.forEach((n) => n.show());
    stage.batchDraw();
  }
}

/**
 * Stage → dataURL → main IPC copy.
 *
 * pixelRatio: bgImage.naturalWidth / imageWidth — 줌·fit 배율과 무관하게
 * 항상 캡처 원본 픽셀 해상도로 export 한다.
 */
export function copyToClipboard(stage: Konva.Stage | null, pixelRatio: number): void {
  // window.editor 는 preload 가 항상 노출한다(src/preload/index.d.ts). 미노출이면
  // 아래 접근이 TypeError 로 즉시 실패하므로 별도 가드는 두지 않는다.
  const api = window.editor;
  if (!stage) {
    throw new Error('Stage ref 가 null — 이미지 로드 실패 가능.');
  }
  const dataUrl = stageToDataUrl(stage, pixelRatio);
  // 히스토리 [편집]용 편집본을 함께 보낸다.
  api.copy(dataUrl, snapshotProject()).catch((err: unknown) => {
    console.error('[asis] editor.copy rejected', err);
  });
}

/**
 * Stage → dataURL → save dialog via main IPC.
 */
export function savePngFile(stage: Konva.Stage | null, pixelRatio: number): void {
  // window.editor 는 preload 가 항상 노출한다(src/preload/index.d.ts). 미노출이면
  // 아래 접근이 TypeError 로 즉시 실패하므로 별도 가드는 두지 않는다.
  const api = window.editor;
  if (!stage) {
    throw new Error('Stage ref 가 null — 이미지 로드 실패 가능.');
  }
  const dataUrl = stageToDataUrl(stage, pixelRatio);
  api.save(dataUrl).then(
    (result) => {
      if (result.saved && result.path) {
        console.info(`[asis editor] PNG 저장 완료: ${result.path}`);
      }
    },
    (err: unknown) => {
      console.error('[asis editor] save rejected', err);
    },
  );
}

/**
 * 에디터 취소 — main 에 cancel IPC 전송.
 */
export function cancelEditor(): void {
  // window.editor 는 preload 가 항상 노출한다(src/preload/index.d.ts). 미노출이면
  // 아래 접근이 TypeError 로 즉시 실패하므로 별도 가드는 두지 않는다.
  const api = window.editor;
  api.cancel();
}
