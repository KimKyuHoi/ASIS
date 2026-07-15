import { defineDict } from '../../../shared/i18n/language';

/**
 * 영역 선택·측정 오버레이의 사용자 노출 문자열.
 * 캡처 성능 임계 경로라 렌더에서는 `selectionStrings[useLanguage()]` 조회만 한다.
 */
export const selectionStrings = defineDict({
  ko: {
    copied: '복사됨',
    hintCancel: '취소',
    hintSelect: '드래그하여 영역을 선택하세요',
    hintColorCopy: '우클릭으로 색상 복사',
    rulerLabel: '측정',
    rulerClear: '측정 지우기',
    rulerClose: '닫기',
    rulerHint: '드래그하여 거리·치수를 측정하세요',
  },
  en: {
    copied: 'copied',
    hintCancel: 'Cancel',
    hintSelect: 'Drag to select an area',
    hintColorCopy: 'Right-click to copy color',
    rulerLabel: 'Measure',
    rulerClear: 'Clear',
    rulerClose: 'Close',
    rulerHint: 'Drag to measure distance & size',
  },
});
