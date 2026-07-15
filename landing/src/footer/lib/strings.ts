import { defineDict } from '../../i18n/lib/define-dict';

type FooterStrings = {
  releases: string
  bugReport: string
};

export const FOOTER_STRINGS = defineDict<FooterStrings>({
  ko: {
    releases: '릴리스',
    bugReport: '버그 제보',
  },
  en: {
    releases: 'Releases',
    bugReport: 'Report a Bug',
  },
});
