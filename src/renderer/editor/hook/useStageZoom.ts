import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useEditorStore } from '../lib/store';

// 줌 시 Stage 캔버스 상한 (한 변, CSS px) — 대형 캡처를 최대 배율로 확대하면
// 캔버스 메모리가 수백 MB 로 튀는 것을 막는다. Retina(2x)에서는 디바이스 픽셀이
// 이 값의 2배가 되므로 Chromium canvas 한계(16384)의 절반 이하로 잡는다.
const MAX_STAGE_PX = 4096;

type ZoomAnchor = { imgX: number; imgY: number; clientX: number; clientY: number };

/**
 * 사용자 줌 — fit 스케일 × zoom. 작은 캡처를 돋보기처럼 확대해서 어노테이션.
 * 캔버스 메모리 폭주 방지로 Stage 한 변이 MAX_STAGE_PX 를 넘지 않게 상한.
 * 두께·점선 줌 보정의 기준(effectiveZoom = stageScale/fitScale)도 여기서 동기화한다 —
 * clamp 로 stageScale 이 상한에 걸려도 화면상 선 두께가 일정하게 유지된다.
 */
export function useStageScale(fitScale: number): number {
  const zoom = useEditorStore((s) => s.zoom);
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);
  const setEffectiveZoom = useEditorStore((s) => s.setEffectiveZoom);
  const stageScale = Math.min(
    fitScale * zoom,
    MAX_STAGE_PX / Math.max(imageWidth, imageHeight, 1),
  );
  useEffect(() => {
    // 이미지 로드 전에는 fitScale 이 0 — 0 나누기 방지 (silent fallback 아님, 의도된 가드).
    if (fitScale <= 0) return;
    setEffectiveZoom(stageScale / fitScale);
  }, [stageScale, fitScale, setEffectiveZoom]);
  return stageScale;
}

/**
 * 트랙패드 핀치(Chromium 에서 ctrlKey=true 인 wheel) / ⌘+휠 → 줌.
 * 일반 두 손가락 스크롤은 컨테이너 스크롤(패닝)에 그대로 쓴다.
 *
 * 줌 앵커 — 휠 줌 직전 포인터 아래 이미지 좌표를 기록해 두고, 새 stageScale 이
 * DOM 에 반영된 직후(useLayoutEffect) 같은 화면 위치에 오도록 스크롤을 보정한다.
 */
export function useWheelZoom(
  containerRef: RefObject<HTMLDivElement | null>,
  stageWrap: HTMLDivElement | null,
  stageScale: number,
): void {
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);

  // React onWheel 은 passive 등록이라 preventDefault 가 무시될 수 있어 native 등록.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !stageWrap) return undefined;
    const onWheel = (ev: WheelEvent): void => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const wrapRect = stageWrap.getBoundingClientRect();
      zoomAnchorRef.current = {
        imgX: (ev.clientX - wrapRect.left) / stageScale,
        imgY: (ev.clientY - wrapRect.top) / stageScale,
        clientX: ev.clientX,
        clientY: ev.clientY,
      };
      // exp 스케일 — deltaY 크기에 비례한 부드러운 줌 (핀치·휠 모두 자연스럽다).
      setZoom(zoom * Math.exp(-ev.deltaY * 0.01));
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [containerRef, stageWrap, stageScale, zoom, setZoom]);

  // 줌 반영 직후 스크롤 보정 — 앵커의 이미지 좌표가 포인터 위치에 머물게 한다.
  // useLayoutEffect: 브라우저 paint 전에 스크롤을 맞춰야 한 프레임 튐이 없다.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const container = containerRef.current;
    if (!anchor || !container || !stageWrap) return;
    zoomAnchorRef.current = null;
    const wrapRect = stageWrap.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    // 스크롤 콘텐츠 안에서 stage-wrap 의 고정 오프셋 (margin 포함).
    const wrapLeft = wrapRect.left - containerRect.left + container.scrollLeft;
    const wrapTop = wrapRect.top - containerRect.top + container.scrollTop;
    // scrollTo — 대입 대신 메서드 호출 (React Compiler 가 hook 인자로 받은 ref 의
    // 값에 대한 대입을 immutable 위반으로 본다). behavior 기본값 auto = 즉시 이동.
    container.scrollTo({
      left: wrapLeft + anchor.imgX * stageScale - (anchor.clientX - containerRect.left),
      top: wrapTop + anchor.imgY * stageScale - (anchor.clientY - containerRect.top),
    });
  }, [containerRef, stageScale, stageWrap]);
}
