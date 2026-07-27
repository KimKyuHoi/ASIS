import { defineDict } from '../../../shared/i18n/language';

/** 타임머신 상태 알약(HUD)의 사용자 노출 문자열. */
export const timeMachineHudStrings = defineDict({
  ko: {
    /** 알약 좌측 라벨 — 무슨 기능이 돌고 있는지. */
    label: '타임머신',
    /** 유지 중인 버퍼 길이 안내. 알약 폭이 좁아 짧게 유지한다. */
    buffer: (seconds: number) => `최근 ${seconds}초`,
    save: '구간 저장',
    saveTitle: '지금까지 유지된 최근 구간을 파일로 저장 (⌘⇧S)',
    stop: '정지',
    stopTitle: '타임머신 녹화 정지 — 버퍼는 폐기됩니다 (⌘⇧T)',
    saving: '구간 저장 중…',
    savedLabel: '저장됨',
    /** 저장 완료 요약 — 길이만. 경로는 버튼으로 연다. */
    savedMeta: (seconds: number) => `${seconds}초`,
    reveal: '파일 보기',
    revealTitle: 'Finder 에서 저장된 파일 표시',
  },
  en: {
    label: 'Time Machine',
    buffer: (seconds: number) => `Last ${seconds}s`,
    save: 'Save Clip',
    saveTitle: 'Save the buffered recent clip to a file (⌘⇧S)',
    stop: 'Stop',
    stopTitle: 'Stop Time Machine — the buffer is discarded (⌘⇧T)',
    saving: 'Saving clip…',
    savedLabel: 'Saved',
    savedMeta: (seconds: number) => `${seconds}s`,
    reveal: 'Show File',
    revealTitle: 'Reveal the saved file in Finder',
  },
});
