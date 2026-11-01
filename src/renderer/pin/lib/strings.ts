import { defineDict } from '../../../shared/i18n/language';

/** 화면 핀 윈도우의 사용자 노출 문자열. hotkey 는 전역 해제 단축키 표기('⌘⇧X'), 해제됐으면 ''. */
export const pinStrings = defineDict({
  ko: {
    close: '닫기',
    lockedChip: '클릭 통과',
    lockedHint: (hotkey: string): string =>
      hotkey ? `${hotkey} 또는 메뉴바에서 해제` : '메뉴바에서 해제',
    toastLocked: '클릭 통과 켜짐',
    toastLockedHint: (hotkey: string): string =>
      hotkey ? `X 또는 ${hotkey}로 해제` : 'X 또는 메뉴바에서 해제',
    toastUnlocked: '클릭 통과 꺼짐',
  },
  en: {
    close: 'Close',
    lockedChip: 'Click-through',
    lockedHint: (hotkey: string): string =>
      hotkey ? `Press ${hotkey} or use the menu bar to unlock` : 'Use the menu bar to unlock',
    toastLocked: 'Click-through on',
    toastLockedHint: (hotkey: string): string =>
      hotkey ? `Press X or ${hotkey} to unlock` : 'Press X or use the menu bar to unlock',
    toastUnlocked: 'Click-through off',
  },
});
