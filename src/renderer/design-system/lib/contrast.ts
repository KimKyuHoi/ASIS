/**
 * WCAG 2.x 대비 계산 — 디자인 토큰 검증용 순수 함수.
 *
 * 토큰 대부분이 반투명(rgba)이라 "글자색 단독"으로는 대비가 정의되지 않는다.
 * 그래서 항상 불투명 바탕 위에 합성(composite)한 뒤 상대 휘도를 비교한다.
 * 기준: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

export type Rgba = { r: number; g: number; b: number; a: number };

export type ContrastKind = 'text' | 'large-text' | 'ui';

export type WcagGrade = 'AAA' | 'AA' | 'fail';

const HEX_RE = /^#([0-9a-f]{3,8})$/i;
const RGB_RE = /^rgba?\(([^)]+)\)$/i;
const SRGB_RE = /^color\(srgb\s+([^)]+)\)$/i;

const splitArgs = (body: string): string[] => body.split(/[\s,/]+/).filter((part) => part !== '');

const parseAlpha = (raw: string | undefined): number => {
  if (raw === undefined) return 1;
  return raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
};

const parseHex = (hex: string): Rgba => {
  const full = hex.length <= 4 ? hex.replace(/[0-9a-f]/gi, '$&$&') : hex;
  const channel = (i: number): number => Number.parseInt(full.slice(i * 2, i * 2 + 2), 16);
  const a = full.length === 8 ? channel(3) / 255 : 1;
  return { r: channel(0), g: channel(1), b: channel(2), a };
};

/** getComputedStyle 가 돌려주는 형식(rgb/rgba/color(srgb …))과 hex 를 읽는다. */
export function parseColor(input: string): Rgba {
  const value = input.trim();
  const hex = HEX_RE.exec(value);
  if (hex) return parseHex(hex[1]);
  const rgb = RGB_RE.exec(value);
  if (rgb) {
    const [r, g, b, a] = splitArgs(rgb[1]);
    return { r: Number(r), g: Number(g), b: Number(b), a: parseAlpha(a) };
  }
  const srgb = SRGB_RE.exec(value);
  if (srgb) {
    const [r, g, b, a] = splitArgs(srgb[1]);
    return { r: Number(r) * 255, g: Number(g) * 255, b: Number(b) * 255, a: parseAlpha(a) };
  }
  throw new Error(`parseColor: 지원하지 않는 색 형식 "${input}"`);
}

/** fg 를 bg 위에 알파 합성한다. bg 가 반투명이면 결과도 반투명. */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (f: number, b: number): number => (f * fg.a + b * bg.a * (1 - fg.a)) / a;
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a };
}

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(color: Rgba): number {
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

/**
 * fg·bg 의 대비. backdrop 은 bg 자체가 반투명일 때 그 아래 깔리는 불투명 바탕
 * (예: 창 배경 위의 --fill). 합성 결과가 여전히 반투명이면 잘못 쓴 것이라 throw.
 */
export function contrastRatio(fg: Rgba, bg: Rgba, backdrop?: Rgba): number {
  const base = backdrop === undefined ? bg : composite(bg, backdrop);
  if (base.a < 1) throw new Error('contrastRatio: 바탕이 불투명하지 않음 — backdrop 을 지정해야 함');
  const front = composite(fg, base);
  const l1 = relativeLuminance(front);
  const l2 = relativeLuminance(base);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** 1.4.3(본문 4.5 / 큰 글자 3) · 1.4.11(UI 3) · 1.4.6(AAA 7 / 4.5) 기준. */
const THRESHOLDS: Record<ContrastKind, { aa: number; aaa: number }> = {
  'text': { aa: 4.5, aaa: 7 },
  'large-text': { aa: 3, aaa: 4.5 },
  // UI 구성요소는 AAA 기준이 없다 — AA 만 의미가 있도록 무한대로 둔다.
  'ui': { aa: 3, aaa: Number.POSITIVE_INFINITY },
};

export function wcagGrade(ratio: number, kind: ContrastKind): WcagGrade {
  const { aa, aaa } = THRESHOLDS[kind];
  if (ratio >= aaa) return 'AAA';
  return ratio >= aa ? 'AA' : 'fail';
}
