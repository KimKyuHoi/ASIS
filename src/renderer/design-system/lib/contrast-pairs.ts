import type { ContrastKind } from './contrast';

/**
 * 대비 검증 대상 — 실제 컴포넌트에서 겹쳐 쓰이는 (전경, 배경) 조합.
 * backdrop: 배경이 반투명일 때 그 아래 깔리는 불투명 면.
 * expectFail: AppKit 원값을 그대로 둔 의도된 예외 (사유 note) — 표에 "예외"로 표시.
 */
export type ContrastPair = {
  fg: string;
  bg: string;
  backdrop?: string;
  kind: ContrastKind;
  use: string;
  expectFail?: string;
};

const BRAND_DECISION = '브랜드 색 유지 결정 — 당근 느낌 우선, AA 의도적 미적용 (2026-11-01)';

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { fg: '--text-primary', bg: '--surface-window', kind: 'text', use: '본문' },
  { fg: '--text-secondary', bg: '--surface-window', kind: 'text', use: '힌트·보조 문구' },
  { fg: '--text-secondary', bg: '--surface-under-page', kind: 'text', use: '아래 페이지 위 힌트' },
  {
    fg: '--text-secondary',
    bg: '--surface-group',
    backdrop: '--surface-window',
    kind: 'text',
    use: '그룹 안 힌트',
  },
  { fg: '--label-secondary', bg: '--surface-window', kind: 'text', use: '레거시 보조 라벨' },
  { fg: '--text-tertiary', bg: '--surface-window', kind: 'large-text', use: '플레이스홀더·메타 (3:1 목표)' },
  { fg: '--text-link', bg: '--surface-window', kind: 'text', use: '링크·plain 버튼' },
  { fg: '--text-danger', bg: '--surface-window', kind: 'text', use: '오류 문구' },
  { fg: '--text-danger', bg: '--surface-under-page', kind: 'text', use: '오류 문구 (아래 페이지)' },
  {
    fg: '--btn-label',
    bg: '--btn-bg',
    backdrop: '--surface-window',
    kind: 'text',
    use: '보조 버튼',
  },
  {
    fg: '--btn-primary-label',
    bg: '--btn-primary-bg',
    kind: 'text',
    use: '기본 버튼',
    expectFail: BRAND_DECISION,
  },
  { fg: '--btn-destructive-label', bg: '--btn-destructive-bg', kind: 'text', use: '파괴 버튼' },
  {
    fg: '--checkbox-mark',
    bg: '--checkbox-bg-checked',
    kind: 'ui',
    use: '체크 표시',
    expectFail: BRAND_DECISION,
  },
  { fg: '--focus-ring', bg: '--surface-window', kind: 'ui', use: '포커스 링', expectFail: BRAND_DECISION },
  { fg: '--focus-ring', bg: '--surface-under-page', kind: 'ui', use: '포커스 링 (아래 페이지)', expectFail: BRAND_DECISION },
  { fg: '--toggle-track-on', bg: '--surface-window', kind: 'ui', use: '켜진 스위치', expectFail: BRAND_DECISION },
  { fg: '--checkbox-border', bg: '--surface-field', kind: 'ui', use: '체크 안 된 상자 윤곽' },
  { fg: '--slider-fill', bg: '--surface-window', kind: 'ui', use: '슬라이더 채움', expectFail: BRAND_DECISION },
  {
    fg: '--field-border',
    bg: '--surface-field',
    kind: 'ui',
    use: '입력칸 테두리',
    expectFail: 'macOS 기본 대비와 맞춤 — 라벨이 칸을 식별. 대비 증가 모드에서 3:1',
  },
  {
    fg: '--border-subtle',
    bg: '--surface-window',
    kind: 'ui',
    use: '구분선',
    expectFail: '장식용 구분선(1.4.11 대상 아님). 대비 증가 모드에서 3:1',
  },
  {
    fg: '--hud-label',
    bg: '--hud-bg',
    backdrop: '--p-white',
    kind: 'text',
    use: 'HUD 글자 (흰 화면 위 최악)',
  },
  {
    fg: '--hud-label-secondary',
    bg: '--hud-bg',
    backdrop: '--p-white',
    kind: 'text',
    use: 'HUD 보조 글자 (흰 화면 위)',
  },
  { fg: '--text-on-danger', bg: '--hud-stop-bg', kind: 'text', use: 'HUD 정지 버튼' },
];
