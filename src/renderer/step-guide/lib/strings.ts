import { defineDict } from '../../../shared/i18n/language';

/** 스텝 가이드 녹화 알약의 사용자 노출 문자열 — 취소·정지는 다른 녹화 알약과 같은 말을 쓴다. */
export const stepGuideStrings = defineDict({
  ko: {
    hudLabel: '스텝 가이드 녹화',
    rec: 'REC',
    stepCount: (n: number) => `${n}단계`,
    stepCountGif: (n: number) => `${n}단계 · GIF 녹화 중`,
    howTo: '다른 앱을 클릭할 때마다 한 단계씩 기록됩니다. 이 알약을 누른 것은 기록되지 않아요.',
    gifStopTitle: 'GIF 녹화를 멈추고 한 단계로 저장',
    gifStartTitle: '이 시점부터 [GIF 정지]까지를 움직이는 한 단계로 녹화',
    gifStop: 'GIF 정지',
    gifStart: 'GIF',
    cancelTitle: '기록한 단계를 버리고 끝내기 (ESC)',
    cancel: '취소',
    stopTitle: '녹화를 끝내고 편집 창 열기',
    stop: '정지',
  },
  en: {
    hudLabel: 'Step guide recording',
    rec: 'REC',
    stepCount: (n: number) => (n === 1 ? '1 step' : `${n} steps`),
    stepCountGif: (n: number) => `${n === 1 ? '1 step' : `${n} steps`} · Recording GIF`,
    howTo: 'Each click in another app records one step. Clicks on this pill are not recorded.',
    gifStopTitle: 'Stop the GIF and save it as one step',
    gifStartTitle: 'Record everything until [Stop GIF] as one animated step',
    gifStop: 'Stop GIF',
    gifStart: 'GIF',
    cancelTitle: 'Discard the recorded steps and finish (ESC)',
    cancel: 'Cancel',
    stopTitle: 'Finish recording and open the editor',
    stop: 'Stop',
  },
});
