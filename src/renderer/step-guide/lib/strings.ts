import { defineDict } from '../../../shared/i18n/language';

/** 스텝 가이드 녹화 컨트롤 바의 사용자 노출 문자열. */
export const stepGuideStrings = defineDict({
  ko: {
    gifStatus: '● GIF 녹화 중',
    stepCount: (n: number) => `${n}단계 기록됨`,
    gifStopTitle: 'GIF 녹화를 멈추고 한 스텝으로 저장',
    gifStartTitle: '이 시점부터 연속 GIF 녹화 시작',
    gifStop: 'GIF 정지',
    gifStart: 'GIF 시작',
    saveMdTitle: 'Markdown 으로 저장하고 종료',
    saveMd: 'MD 저장',
    saveHtmlTitle: 'HTML 으로 저장하고 종료',
    saveHtml: 'HTML 저장',
  },
  en: {
    gifStatus: '● Recording GIF',
    stepCount: (n: number) => `${n} steps captured`,
    gifStopTitle: 'Stop the GIF and save it as one step',
    gifStartTitle: 'Start recording a GIF from here',
    gifStop: 'Stop GIF',
    gifStart: 'Start GIF',
    saveMdTitle: 'Save as Markdown and finish',
    saveMd: 'Save MD',
    saveHtmlTitle: 'Save as HTML and finish',
    saveHtml: 'Save HTML',
  },
});
