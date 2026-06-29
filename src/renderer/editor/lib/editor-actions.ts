import type Konva from 'konva';
import { useEditorStore } from './store';

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
 * Transformer 핸들을 숨기고, 줌 시각 보정(1/effectiveZoom 두께)을 원본 두께로 되돌린 채
 * toDataURL 을 호출한 뒤 즉시 복원한다.
 * - Transformer 숨김: 선택 앵커박스가 export 이미지에 포함되는 것 방지.
 * - 두께 복원: 화면에서는 줌과 무관하게 일정 두께로 보이지만(Shape 의 vw 보정),
 *   export 는 데이터의 이미지 픽셀 두께 그대로 — 줌 상태와 무관한 결과 보장.
 *
 * Konva.toDataURL 은 오프스크린 캔버스에 씬을 재렌더하므로 hide/show·attr 변경이
 * 동기적으로 동작하고, 화면에 깜빡임이 발생하지 않는다.
 */
export function stageToDataUrl(stage: Konva.Stage, pixelRatio: number): string {
  const tr = stage.findOne('Transformer') as Konva.Transformer | undefined;
  if (tr) tr.hide();
  const { effectiveZoom } = useEditorStore.getState();
  applyZoomComp(stage, 1);
  const dataUrl = stage.toDataURL({ pixelRatio });
  applyZoomComp(stage, 1 / effectiveZoom);
  if (tr) {
    tr.show();
  }
  stage.batchDraw();
  return dataUrl;
}

/**
 * Stage → dataURL → main IPC copy.
 *
 * pixelRatio: devicePixelRatio / stageScale — stageScale 이 1 미만이면 그만큼 보정해
 * 항상 원본 물리 픽셀 해상도로 export 한다.
 */
export function copyToClipboard(stage: Konva.Stage | null, pixelRatio: number): void {
  const api = window.editor;
  if (!api) {
    throw new Error('window.editor 미노출 — preload 셋업 확인.');
  }
  if (!stage) {
    throw new Error('Stage ref 가 null — 이미지 로드 실패 가능.');
  }
  const dataUrl = stageToDataUrl(stage, pixelRatio);
  api.copy(dataUrl).catch((err: unknown) => {
    console.error('[asis] editor.copy rejected', err);
  });
}

/**
 * Stage → dataURL → save dialog via main IPC.
 */
export function savePngFile(stage: Konva.Stage | null, pixelRatio: number): void {
  const api = window.editor;
  if (!api) {
    throw new Error('window.editor 미노출 — preload 셋업 확인.');
  }
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
  const api = window.editor;
  if (!api) {
    throw new Error('window.editor 미노출 — preload 셋업 확인.');
  }
  api.cancel();
}
