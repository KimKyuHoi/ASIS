import { useSyncExternalStore } from 'react';
import { tokenColor, withAlpha } from '../lib/theme-color';

/** 캔버스 위 편집 UI(선택 박스·marquee·끝점 핸들) 색 — export 에는 나가지 않는다. */
export type ChromeColors = {
  /** 선택 테두리·핸들 윤곽 (브랜드 강조색) */
  accent: string;
  /** marquee 면 — 강조색 12% */
  accentWash: string;
  /**
   * 핸들 안쪽 면 — 캡처 내용 위에 얹히므로 외형과 무관하게 흰 면(강조색 테두리와 대비).
   * --accent-text 는 "강조색 위 글자" 흰색 토큰이라 의미가 맞는다.
   */
  handleFill: string;
  /** 크롭 모드에서 잘려 나갈 바깥 영역을 덮는 면 */
  scrim: string;
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

let cached: { dark: boolean; colors: ChromeColors } | null = null;

function read(): ChromeColors {
  const dark = window.matchMedia(DARK_QUERY).matches;
  // useSyncExternalStore 는 같은 스냅샷이면 같은 참조를 요구 — 외형이 바뀔 때만 새로 푼다.
  if (cached?.dark === dark) return cached.colors;
  const accent = tokenColor('--accent');
  const colors = {
    accent,
    accentWash: withAlpha(accent, 0.12),
    handleFill: tokenColor('--accent-text'),
    scrim: tokenColor('--surface-scrim'),
  };
  cached = { dark, colors };
  return colors;
}

function subscribe(onChange: () => void): () => void {
  // 시스템 외형 또는 설정의 "화면 모드"(main 의 nativeTheme.themeSource) 변경 시 발화.
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * 토큰에서 푼 편집 UI 색. 외형이 바뀌면 다시 푼다.
 * side-effects.md — 외부 상태(matchMedia)를 React 가 읽으므로 useSyncExternalStore.
 */
export function useChromeColors(): ChromeColors {
  return useSyncExternalStore(subscribe, read);
}
