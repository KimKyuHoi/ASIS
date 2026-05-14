import type Konva from 'konva';

/**
 * Stage → dataURL → main IPC copy.
 */
export function copyToClipboard(stage: Konva.Stage | null): void {
  const api = window.editor;
  if (!api) {
    throw new Error('window.editor 미노출 — preload 셋업 확인.');
  }
  if (!stage) {
    throw new Error('Stage ref 가 null — 이미지 로드 실패 가능.');
  }
  const dataUrl = stage.toDataURL({ pixelRatio: 2 });
  api.copy(dataUrl).catch((err: unknown) => {
    console.error('[asis] editor.copy rejected', err);
  });
}

/**
 * Stage → dataURL → save dialog via main IPC.
 */
export function savePngFile(stage: Konva.Stage | null): void {
  const api = window.editor;
  if (!api) {
    throw new Error('window.editor 미노출 — preload 셋업 확인.');
  }
  if (!stage) {
    throw new Error('Stage ref 가 null — 이미지 로드 실패 가능.');
  }
  const dataUrl = stage.toDataURL({ pixelRatio: 2 });
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
