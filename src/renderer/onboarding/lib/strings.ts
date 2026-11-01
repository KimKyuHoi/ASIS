import { defineDict } from '../../../shared/i18n/language';

/**
 * 첫 실행 언어 선택 화면의 안내 문구.
 * 언어 버튼 라벨(한국어/English)은 원어 고정 표기라 사전에 두지 않는다.
 */
export const onboardingStrings = defineDict({
  ko: {
    subtitle: '사용할 언어를 선택해 주세요',
    note: '나중에 환경설정에서 변경할 수 있어요',
  },
  en: {
    subtitle: 'Choose your language',
    note: 'You can change this later in Settings',
  },
});
