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
    editTitle: '주석을 그대로 다시 편집',
    edit: '편집',
    editFailedTitle: '편집본을 열지 못했습니다',
    editFailedHint: '오래된 항목은 편집본이 정리됩니다. 목록을 새로 고쳤습니다.',
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
    editTitle: 'Reopen with editable annotations',
    edit: 'Edit',
    editFailedTitle: "Couldn't open the editable copy",
    editFailedHint: 'Older items lose their editable copy. The list has been refreshed.',
  },
});
