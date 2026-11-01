import type { Rect } from '../types/selection';

/** 선택 영역을 main 에 보내 캡처를 확정한다. */
export function captureRect(rect: Rect): void {
  window.selection.capture(rect).catch((err: unknown) => {
    console.error('selection.capture rejected', err);
  });
}

/** 오버레이를 닫는다 (캡처 없이). */
export function cancelOverlay(): void {
  window.selection.cancel();
}
