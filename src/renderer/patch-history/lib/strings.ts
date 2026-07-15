import { defineDict } from '../../../shared/i18n/language';

/** 변경 이력(패치 노트) 화면 문자열 사전. */
export const patchHistoryStrings = defineDict({
  ko: {
    loading: '변경 이력을 불러오는 중…',
    loadFailed: '변경 이력을 불러오지 못했습니다.',
    empty: '아직 게시된 릴리스가 없습니다.',
    viewOnGitHub: 'GitHub에서 보기 ↗',
    noContent: '(내용 없음)',
  },
  en: {
    loading: 'Loading changelog…',
    loadFailed: 'Failed to load changelog.',
    empty: 'No releases published yet.',
    viewOnGitHub: 'View on GitHub ↗',
    noContent: '(No content)',
  },
});
