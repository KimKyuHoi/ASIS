import { defineDict } from '../../../shared/i18n/language';

/**
 * 캡처 히스토리 화면 문자열 사전.
 *
 * title/alt 는 개수·시각을 끼워 넣는 보간 함수다.
 */
export const historyStrings = defineDict({
  ko: {
    emptyText: '아직 캡처 기록이 없습니다.',
    emptyHint: '캡처 후 복사 또는 핀을 누르면 여기에 표시됩니다.',
    title: (count: number): string => `캡처 히스토리 (${count})`,
    thumbAlt: (time: string): string => `캡처 ${time}`,
    copyTitle: '클립보드 복사',
    copy: '복사',
    pinTitle: '핀으로 띄우기',
    pin: '핀',
  },
  en: {
    emptyText: 'No captures yet.',
    emptyHint: 'Captures you copy or pin will appear here.',
    title: (count: number): string => `Capture History (${count})`,
    thumbAlt: (time: string): string => `Capture ${time}`,
    copyTitle: 'Copy to Clipboard',
    copy: 'Copy',
    pinTitle: 'Pin to Screen',
    pin: 'Pin',
  },
});
