import { defineDict } from '../../../shared/i18n/language';

/** GIF 녹화 컨트롤 바의 사용자 노출 문자열. */
export const recorderStrings = defineDict({
  ko: {
    encoding: 'GIF 만드는 중…',
    encodingFrames: (n: number) => `${n}프레임 인코딩`,
    frames: (n: number) => `${n}프레임`,
    cancelTitle: '취소 (ESC)',
    cancel: '취소',
    stopTitle: '정지 (Enter)',
    stop: '정지',
  },
  en: {
    encoding: 'Creating GIF…',
    encodingFrames: (n: number) => `Encoding ${n} frames`,
    frames: (n: number) => `${n} frames`,
    cancelTitle: 'Cancel (ESC)',
    cancel: 'Cancel',
    stopTitle: 'Stop (Enter)',
    stop: 'Stop',
  },
});
