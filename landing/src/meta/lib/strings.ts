import { defineDict } from '../../i18n/lib/define-dict';

type MetaStrings = {
  title: string
  description: string
};

/** document.title / meta[name=description] 를 언어에 맞춰 갱신하기 위한 문구. */
export const META_STRINGS = defineDict<MetaStrings>({
  ko: {
    title: 'ASIS — macOS 캡처 & 어노테이션 도구',
    description:
      '스크린샷을 찍고, 그 위에 바로 그리고, 클립보드로 복사하거나 핀으로 화면에 고정하세요.',
  },
  en: {
    title: 'ASIS — macOS Capture & Annotation Tool',
    description:
      'Take a screenshot, draw right on top of it, then copy it to your clipboard or pin it to your screen.',
  },
});
