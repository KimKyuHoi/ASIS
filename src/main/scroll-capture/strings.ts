import { defineDict, getLanguage } from '../../shared/i18n/language';

/**
 * 스크롤 캡처 main 쪽 사용자 노출 문구(알림으로 나가는 에러). 이 기능에서만 쓰여서
 * i18n/strings.ts 대신 기능 폴더에 둔다 — tMain() 과 같은 언어 store 를 읽는다.
 * 개발자용 원문(stderr·크기 값 등) 은 UserFacingError 의 detail 로 넘겨 로그에만 남긴다.
 */
const scrollCaptureMainStrings = defineDict({
  ko: {
    captureFailed: '화면을 캡처하지 못했습니다. 화면 기록 권한을 확인해 주세요.',
    noFrames: '캡처된 화면이 없습니다. 다시 시도해 주세요.',
    frameSizeChanged: '캡처 중 영역 크기가 바뀌어 이어붙일 수 없습니다. 디스플레이 설정을 바꾸지 말고 다시 시도해 주세요.',
    stitchFailed: '캡처한 화면을 이어붙이지 못했습니다.',
    saveFailed: '파일로 저장하지 못했습니다. 결과는 클립보드에 복사했습니다.',
    gapsNotice: (n: number) =>
      `${n}곳을 이어붙이지 못했습니다 — 너무 빨리 스크롤했거나 영역이 가려졌을 수 있습니다. 그 부분은 빈틈·중복이 있을 수 있어요.`,
  },
  en: {
    captureFailed: "Couldn't capture the screen. Check the Screen Recording permission.",
    noFrames: 'Nothing was captured. Please try again.',
    frameSizeChanged: "The capture area changed size, so the shots can't be stitched. Try again without changing display settings.",
    stitchFailed: "Couldn't stitch the captured shots together.",
    saveFailed: "Couldn't save the file. The result was copied to the clipboard.",
    gapsNotice: (n: number) =>
      `Couldn't stitch ${n} ${n === 1 ? 'spot' : 'spots'} — you may have scrolled too fast or the area was covered. Those parts may have gaps or repeats.`,
  },
});

export function tScroll(): (typeof scrollCaptureMainStrings)['ko'] {
  return scrollCaptureMainStrings[getLanguage()];
}
