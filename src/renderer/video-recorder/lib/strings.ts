import { defineDict } from '../../../shared/i18n/language';

/** 화면 영상 녹화 컨트롤 바의 사용자 노출 문자열. */
export const videoRecorderStrings = defineDict({
  ko: {
    saving: '저장 준비 중…',
    cancelTitle: '취소 (ESC)',
    cancel: '취소',
    stopTitle: '정지 (Enter)',
    stop: '정지',
  },
  en: {
    saving: 'Preparing to save…',
    cancelTitle: 'Cancel (ESC)',
    cancel: 'Cancel',
    stopTitle: 'Stop (Enter)',
    stop: 'Stop',
  },
});
