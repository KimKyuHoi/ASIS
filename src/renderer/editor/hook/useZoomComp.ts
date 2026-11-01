import { useEditorStore } from '../lib/store';
import { dashPattern } from '../lib/dash';
import type { DashStyle } from '../types/shapes';

export type DashProps = { dashEnabled: boolean; dash?: number[]; baseDash?: number[] };

/**
 * 줌 시각 보정 — 돋보기(줌)는 이미지를 들여다보는 용도라, 도형 선 두께는 줌과
 * 무관하게 화면상 일정해야 한다 (기존·신규 도형 동일). 데이터(strokeWidth)는
 * 이미지 픽셀 단위 그대로 두고 *렌더만* 1/effectiveZoom 으로 나눈다. export 는
 * stageToDataUrl 이 baseStrokeWidth attr 로 원본 두께를 복원해 굽는다.
 *
 * 실제 적용 배율(stageScale/fitScale) — zoom 이 아닌 이 값으로 보정해야
 * 큰 이미지에서 stageScale 이 상한에 걸려도 화면 두께가 일정하다.
 */
export function useZoomComp(): {
  vw: (w: number) => number;
  dashProps: (s: { dash?: DashStyle; strokeWidth: number }) => DashProps;
} {
  const effectiveZoom = useEditorStore((s) => s.effectiveZoom);
  const vw = (w: number): number => w / effectiveZoom;
  // 점선 props — 켜진 경우만 dash 배열을 화면 보정(vw)하고, export 복원용
  // baseDash(원본 이미지 픽셀)를 함께 마킹한다. 실선이면 dashEnabled=false 로 끈다.
  const dashProps = (s: { dash?: DashStyle; strokeWidth: number }): DashProps => {
    const base = dashPattern(s.dash ?? 'solid', s.strokeWidth);
    if (!base) return { dashEnabled: false };
    return { dashEnabled: true, dash: base.map(vw), baseDash: base };
  };
  return { vw, dashProps };
}
