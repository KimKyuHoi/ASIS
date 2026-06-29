import type { DashStyle } from '../types/shapes';

/** 드롭다운 노출용 선 스타일 목록 (순서 = UI 표시 순서). */
export const DASH_STYLES: readonly { value: DashStyle; label: string }[] = [
  { value: 'solid', label: '실선' },
  { value: 'dashed', label: '점선' },
  { value: 'dotted', label: '도트' },
  { value: 'long-dash', label: '긴 파선' },
  { value: 'dash-dot', label: '일점쇄선' },
];

/**
 * 선 스타일별 Konva `dash` 배열 [세그먼트, 간격, …] — solid 는 점선이 아니므로 undefined.
 *
 * 두께에 비례시켜 굵은 선에서도 점선 비율이 일정하게 보이도록 한다.
 * 반환 값은 *이미지 픽셀 단위* — 화면 렌더 시 1/effectiveZoom 보정(Shape 의 vw),
 * export 시 baseDash attr 로 원본 픽셀 값을 복원한다 (editor-actions).
 */
export function dashPattern(style: DashStyle, strokeWidth: number): number[] | undefined {
  const w = Math.max(1, strokeWidth);
  switch (style) {
    case 'solid':
      return undefined;
    case 'dashed':
      return [w * 2.5, w * 2];
    case 'dotted':
      return [w * 0.5, w * 1.5];
    case 'long-dash':
      return [w * 5, w * 2.5];
    case 'dash-dot':
      return [w * 3, w * 1.5, w * 0.5, w * 1.5];
    default: {
      const _exhaustive: never = style;
      return _exhaustive;
    }
  }
}
