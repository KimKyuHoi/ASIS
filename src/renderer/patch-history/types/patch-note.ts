import type { Language } from '../../../shared/i18n/language';

/** 변경 이력 한 건 (main/patch-notes/patchNotes.ts 와 동일 형태). */
export type PatchNote = {
  /** 태그 형태 (예: 'v0.8.0'). */
  version: string;
  name: string;
  /** 언어별 마크다운. GitHub 본문만 있는 옛 버전은 ko·en 이 같은 원문이다. */
  body: Record<Language, string>;
  /** ISO 8601 게시일. null = 아직 GitHub 에 게시되지 않은 버전(번들 노트만 있음). */
  date: string | null;
  /** GitHub 릴리스 페이지 URL. */
  url: string;
  /** 저장소 release-notes/ 에서 온 노트인가. */
  bundled: boolean;
};
