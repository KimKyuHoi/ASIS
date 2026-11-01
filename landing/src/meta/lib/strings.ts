import { defineDict } from '../../i18n/lib/define-dict';

type MetaStrings = {
  title: string
  description: string
};

/** document.title / meta[name=description] 를 언어에 맞춰 갱신하기 위한 문구. */
export const META_STRINGS = defineDict<MetaStrings>({
  ko: {
    title: 'ASIS — macOS 캡처 & 주석 도구',
    description:
      '캡처·화면 녹화·GIF·스크롤 캡처·스텝 가이드를 만들고, 그 위에 바로 주석을 달아 공유하는 무료 macOS 앱.',
  },
  en: {
    title: 'ASIS — macOS Capture & Annotation Tool',
    description:
      'A free macOS app for screenshots, screen and GIF recording, scrolling captures, and step guides — annotated on the spot and ready to share.',
  },
});
