import { contrastRatio, parseColor, type Rgba } from './contrast';

/**
 * 강조색 도우미. ASIS 기본 강조색은 브랜드 오렌지(tokens.css 의 --p-orange-*)이고,
 * 오렌지는 용도별 단계가 tokens.css 에 미리 정해져 있다.
 *
 * 다른 색(macOS 시스템 강조색 등)으로 바꿔 보려면 accentOverrides() 로 관련 토큰을 한 번에
 * 덮어쓴다 — --accent 하나만 바꾸면 버튼 면·포커스 링·틴트가 오렌지로 남는다.
 */

const FILL_RATIO = 0.85;
const PRESSED_RATIO = 0.72;
const WHITE = '#ffffff';
const INK = 'rgba(0, 0, 0, 0.847)';

const toBlack = (color: Rgba, ratio: number): Rgba => ({
  r: color.r * ratio,
  g: color.g * ratio,
  b: color.b * ratio,
  a: 1,
});

const css = (color: Rgba): string =>
  `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;

/** 강조색 면 위에 흰 글자와 검은 글자 중 대비가 높은 쪽 (노랑·초록 대응). */
export function accentTextFor(fill: Rgba): string {
  const onWhite = contrastRatio(parseColor(WHITE), fill);
  const onInk = contrastRatio(parseColor(INK), fill);
  return onWhite >= onInk ? WHITE : INK;
}

/** 단색 강조색 하나로 강조색 계열 토큰을 모두 만든다 (라이트/다크 구분 없음). */
export function accentOverrides(accent: string): Record<string, string> {
  const base = parseColor(accent);
  const fill = toBlack(base, FILL_RATIO);
  return {
    '--accent': accent,
    '--accent-fill': css(fill),
    '--accent-fill-pressed': css(toBlack(base, PRESSED_RATIO)),
    '--accent-text': accentTextFor(fill),
    '--accent-tint': `color-mix(in srgb, ${accent} 16%, transparent)`,
    '--accent-tint-text': css(fill),
    '--focus-ring': accent,
  };
}

/**
 * macOS 강조색 목록 — Storybook 비교용 근사값(시스템 색 aqua 실측을 빌림).
 * 실제 controlAccentColor 는 main 의 systemPreferences.getAccentColor() 가 정답이다.
 */
export const SYSTEM_ACCENTS = {
  blue: '#007aff',
  purple: '#cb30e0',
  pink: '#ff2d55',
  red: '#ff383c',
  yellow: '#ffcc00',
  green: '#34c759',
  graphite: '#8c8c8c',
} as const;

export type SystemAccentName = keyof typeof SYSTEM_ACCENTS;
