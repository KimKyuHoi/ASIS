import { defineDict } from '../../../shared/i18n/language';

/** 스크롤 캡처 컨트롤 바의 사용자 노출 문자열. */
export const scrollCaptureStrings = defineDict({
  ko: {
    stitching: '이어붙이는 중…',
    stitchingCount: (n: number) => `${n}장 합성`,
    capturingCount: (n: number) => `${n}장 · 천천히 스크롤`,
    cancelTitle: '취소 (ESC)',
    cancel: '취소',
    stopTitle: '정지 (Enter)',
    stop: '정지',
  },
  en: {
    stitching: 'Stitching…',
    stitchingCount: (n: number) => `Merging ${n} images`,
    capturingCount: (n: number) => `${n} shots · Scroll slowly`,
    cancelTitle: 'Cancel (ESC)',
    cancel: 'Cancel',
    stopTitle: 'Stop (Enter)',
    stop: 'Stop',
  },
});
