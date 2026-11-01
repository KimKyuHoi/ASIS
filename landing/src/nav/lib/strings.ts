import { defineDict } from '../../i18n/lib/define-dict';
import type { Route } from '../types/route';

type NavStrings = {
  labels: Record<Route, string>
  languageToggleAria: string
  /** 현재 테마의 반대로 바꾸는 버튼 — 무엇으로 바뀌는지를 읽어 준다. */
  themeToLight: string
  themeToDark: string
};

export const NAV_STRINGS = defineDict<NavStrings>({
  ko: {
    labels: {
      home: '홈',
      features: '기능 상세',
      faq: 'FAQ·문의',
      bug: '버그 제보',
    },
    languageToggleAria: '언어 전환',
    themeToLight: '라이트 모드로 전환',
    themeToDark: '다크 모드로 전환',
  },
  en: {
    labels: {
      home: 'Home',
      features: 'Features',
      faq: 'FAQ',
      bug: 'Report a Bug',
    },
    languageToggleAria: 'Switch language',
    themeToLight: 'Switch to light mode',
    themeToDark: 'Switch to dark mode',
  },
});
