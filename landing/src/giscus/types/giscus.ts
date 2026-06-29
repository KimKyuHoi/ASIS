/**
 * giscus 임베드 설정.
 * repoId / categoryId 는 GitHub GraphQL 로 조회한 node ID (build-time 고정값).
 * mapping='specific' + term 으로 탭마다 별도 Discussion 스레드에 매핑한다
 * (해시 라우팅이라 pathname 은 모든 탭이 동일 → pathname 매핑은 쓸 수 없다).
 */
export type GiscusConfig = {
  category: string
  categoryId: string
  /** mapping='specific' 일 때 Discussion 제목으로 쓰이는 고정 term */
  term: string
  /** giscus 댓글 입력창 위치 */
  inputPosition: 'top' | 'bottom'
};

export const GISCUS_REPO = 'KimKyuHoi/ASIS';
export const GISCUS_REPO_ID = 'R_kgDOSQhz7A';

/** 사이트가 다크 단색 배경(#0d0d0f)이라 투명 다크 테마로 자연스럽게 녹인다. */
export const GISCUS_THEME = 'transparent_dark';
export const GISCUS_LANG = 'ko';

/** FAQ·문의 → Q&A 카테고리 */
export const FAQ_GISCUS: GiscusConfig = {
  category: 'Q&A',
  categoryId: 'DIC_kwDOSQhz7M4DAIex',
  term: 'FAQ · 기능/수정 문의',
  inputPosition: 'top',
};

/** 버그 제보 → General 카테고리 */
export const BUG_GISCUS: GiscusConfig = {
  category: 'General',
  categoryId: 'DIC_kwDOSQhz7M4DAIew',
  term: '버그 제보',
  inputPosition: 'top',
};
