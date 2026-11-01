import type Konva from 'konva';

/**
 * 드래그 시작 시 포인터를 캔버스에 붙잡는다 — Konva 는 포인터 리스너를 content 요소에만 달아서
 * (konva/lib/Stage.js _bindContentEvents) 캔버스 밖에서 놓으면 pointerup 이 오지 않는다.
 * 그러면 드래그 상태가 남아 버튼을 놓은 뒤에도 영역·도형이 계속 바뀐다. capture 는 pointerup 에서
 * 브라우저가 자동으로 푼다. 밖으로 나간 좌표는 호출부(toImagePoint)가 이미지 경계로 clamp 한다.
 */
export function capturePointer(e: Konva.KonvaEventObject<PointerEvent>): void {
  const target = e.evt.target;
  if (target instanceof Element) target.setPointerCapture(e.evt.pointerId);
}
