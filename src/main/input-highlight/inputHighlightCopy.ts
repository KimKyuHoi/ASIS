import { defineDict, getLanguage } from '../../shared/i18n/language';

/**
 * 녹화 입력 표시(클릭 링·키 배지) 알림 문구.
 * guideCopy.ts 와 같이 도메인 안에 둔다 — 이 기능만 쓰는 문구라 공유 사전을 키우지 않는다.
 */
export const inputHighlightCopy = defineDict({
  ko: {
    needsAccessibility:
      '클릭·키 표시에는 손쉬운 사용 권한이 필요합니다. 녹화는 표시 없이 계속됩니다.',
    helperMissing: '클릭·키 감지 도구를 찾지 못해 표시 없이 녹화합니다. 앱을 다시 설치해 주세요.',
    helperStopped: '클릭·키 감지가 멈춰 이후 녹화에는 표시가 나오지 않습니다.',
  },
  en: {
    needsAccessibility:
      'Showing clicks and keys requires Accessibility permission. Recording continues without them.',
    helperMissing: "Couldn't find the click and key detection helper, so recording continues without them. Please reinstall the app.",
    helperStopped: 'Click and key detection stopped. The rest of the recording won\'t show them.',
  },
});

export type InputHighlightCopy = (typeof inputHighlightCopy)['ko'];

export function tInputHighlight(): InputHighlightCopy {
  return inputHighlightCopy[getLanguage()];
}
