import { defineDict } from '../../i18n/lib/define-dict';
import type { Route } from '../types/route';

type NavStrings = {
  labels: Record<Route, string>
  languageToggleAria: string
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
  },
  en: {
    labels: {
      home: 'Home',
      features: 'Features',
      faq: 'FAQ',
      bug: 'Report a Bug',
    },
    languageToggleAria: 'Switch language',
  },
});
