import type Konva from 'konva';

/**
 * Transformer 핸들을 숨긴 채로 toDataURL 을 호출하고 즉시 복원한다.
 * 선택 앵커박스가 export 이미지에 포함되는 것을 방지한다.
 *
 * Konva.toDataURL 은 오프스크린 캔버스에 씬을 재렌더하므로 hide/show 가 동기적으로
 * 동작하고, 화면에 깜빡임이 발생하지 않는다.
 */
export function stageToDataUrl(stage: Konva.Stage, pixelRatio: number): string {
  const tr = stage.findOne('Transformer') as Konva.Transformer | undefined;
  if (tr) tr.hide();
  const dataUrl = stage.toDataURL({ pixelRatio });
  if (tr) {
    tr.show();
    tr.getLayer()?.batchDraw();
  }
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
