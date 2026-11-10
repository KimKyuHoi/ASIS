import { defineDict } from '../../i18n/lib/define-dict';
import type { Route } from '../../nav/types/route';

type PageMeta = {
  /** 검색 결과 제목 — 60자 안팎. 사람들이 실제로 치는 말(맥 캡처·스크롤 캡처·GIF)을 앞쪽에. */
  title: string
  /** 검색 결과 스니펫·공유 카드 설명 — 160자 안팎. "ASIS는 ~하는 앱" 처럼 한 문장 정의를 먼저 둔다. */
  description: string
};

type MetaStrings = {
  pages: Record<Route, PageMeta>
  /** og:locale 형식 (ko_KR / en_US). */
  ogLocale: string
};

/** 빌드 때 페이지마다 <head> 에 정적으로 박힌다(meta/lib/head.ts). */
export const META_STRINGS = defineDict<MetaStrings>({
  ko: {
    ogLocale: 'ko_KR',
    pages: {
      home: {
        title: 'ASIS — 무료 맥 화면 캡처·스크롤 캡처·GIF 녹화 & 주석 앱',
        description:
          'ASIS는 맥(macOS)에서 화면 캡처, 스크롤 캡처(긴 화면 캡처), 화면·GIF 녹화, 스텝 가이드를 만들고 화살표·사각형·텍스트·블러·모자이크로 바로 주석을 다는 무료 오픈소스 앱입니다.',
      },
      features: {
        title: '기능 상세 — 맥 캡처 주석 도구·스크롤 캡처·GIF 스튜디오 | ASIS',
        description:
          'ASIS의 모든 기능: 한 글자 단축키로 쓰는 12가지 주석 도구, 영역·윈도우·전체화면·지연 캡처, 스크롤 캡처, 화면·GIF 녹화, 프레임별 주석 GIF 스튜디오, 스텝 가이드, 화면 핀.',
      },
      faq: {
        title: '자주 묻는 질문 — 맥 스크롤 캡처·스크린샷 주석·GIF 녹화 방법 | ASIS',
        description:
          '맥에서 스크롤 캡처하는 법, 스크린샷에 화살표·블러 넣는 법, 화면을 GIF로 녹화하는 법, 가격·라이선스·지원 macOS·권한까지 ASIS에 대해 자주 묻는 질문.',
      },
      bug: {
        title: '버그 제보 | ASIS',
        description: 'ASIS를 쓰다 문제가 생기면 재현 방법과 macOS·앱 버전을 남겨주세요.',
      },
    },
  },
  en: {
    ogLocale: 'en_US',
    pages: {
      home: {
        title: 'ASIS — Free Mac Screenshot, Scrolling Capture & GIF Recorder',
        description:
          'ASIS is a free, open-source macOS app for screenshots, scrolling captures, screen and GIF recording, and step-by-step guides. Annotate with arrows, boxes, text, blur and mosaic, then copy, share, or pin.',
      },
      features: {
        title: 'Features — Mac Screenshot Annotation, Scrolling Capture, GIF Studio | ASIS',
        description:
          'Every ASIS feature: 12 annotation tools with one-key shortcuts, area/window/full-screen/delayed capture, scrolling capture, screen and GIF recording, a frame-by-frame GIF Studio, step guides, and pinning.',
      },
      faq: {
        title: 'FAQ — Scrolling Screenshots, Annotating & GIF Recording on Mac | ASIS',
        description:
          'How to take a scrolling screenshot on a Mac, annotate a screenshot with arrows and blur, and record your screen as a GIF — plus pricing, license, supported macOS versions, and permissions.',
      },
      bug: {
        title: 'Report a Bug | ASIS',
        description: 'Hit a problem with ASIS? Share the steps to reproduce it along with your macOS and app version.',
      },
    },
  },
});
