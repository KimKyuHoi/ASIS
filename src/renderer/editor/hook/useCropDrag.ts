import { useRef } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '../lib/store';
import { isUsableCrop, rectFromPoints } from '../lib/crop';
import { CROP_BOX_NAME } from '../lib/edit-ui';
import { capturePointer } from '../lib/pointer-capture';
import type { CropRect } from '../types/crop';

type Point = { x: number; y: number };

/** 크롭 영역 드래그 — 시작점과, 너무 작게 끝났거나 취소됐을 때 되돌릴 직전 영역. */
type CropDrag = { start: Point; previous: CropRect | null };

/** 크롭 박스 본체나 Transformer 핸들 위 — Konva 드래그·변환에 맡기고 새 영역을 그리지 않는다. */
function isCropControl(target: Konva.Node): boolean {
  return target.hasName(CROP_BOX_NAME) || target.getParent()?.getClassName() === 'Transformer';
}

/**
 * 크롭 모드의 새 영역 드래그 — useStagePointer 가 크롭 모드일 때 위임한다.
 * move·end 는 드래그 중이었으면 true (호출부가 다른 처리를 건너뛴다).
 * 박스 이동·핸들 조정은 CropLayer 의 Konva 드래그·Transformer 가 맡는다.
 */
export function useCropDrag(): {
  start: (e: Konva.KonvaEventObject<PointerEvent>, pt: Point) => void;
  move: (pt: Point) => boolean;
  end: () => boolean;
  cancel: () => void;
} {
  const ref = useRef<CropDrag | null>(null);

  const start = (e: Konva.KonvaEventObject<PointerEvent>, pt: Point): void => {
    if (isCropControl(e.target)) return;
    const st = useEditorStore.getState();
    capturePointer(e);
    ref.current = { start: pt, previous: st.cropRect };
    st.setCropRect({ ...pt, w: 0, h: 0 });
  };

  const move = (pt: Point): boolean => {
    const drag = ref.current;
    if (!drag) return false;
    useEditorStore.getState().setCropRect(rectFromPoints(drag.start, pt));
    return true;
  };

  const end = (): boolean => {
    const drag = ref.current;
    if (!drag) return false;
    ref.current = null;
    const st = useEditorStore.getState();
    // 클릭만 했거나 너무 작으면 직전 영역을 그대로 둔다.
    if (!isUsableCrop(st.cropRect)) st.setCropRect(drag.previous);
    return true;
  };

  const cancel = (): void => {
    const drag = ref.current;
    if (!drag) return;
    ref.current = null;
    useEditorStore.getState().setCropRect(drag.previous);
  };

  return { start, move, end, cancel };
}
