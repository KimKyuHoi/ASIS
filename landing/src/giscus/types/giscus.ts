/**
 * giscus 임베드 설정.
 * repoId / categoryId 는 GitHub GraphQL 로 조회한 node ID (build-time 고정값).
 * mapping='specific' + term 으로 탭마다 별도 Discussion 스레드에 매핑한다
 * (pathname 매핑은 쓰지 않는다 — 언어별 URL(/ASIS/faq/ · /ASIS/ko/faq/)이 달라서 같은 탭의
 * 댓글이 언어마다 갈라지고, 예전 해시 라우팅 시절 스레드와도 끊긴다).
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

/** 사이트 테마(라이트/다크)별 giscus 테마. 다크는 배경이 비치는 투명 다크로 녹인다. */
export const GISCUS_THEMES = {
  light: 'light',
  dark: 'transparent_dark',
} as const;

/**
 * 아래 term 은 giscus Discussion 스레드에 매핑되는 "식별자"다(mapping='specific').
 * 사용자에게 보이는 카피가 아니라 스레드 키이므로 언어별로 바꾸지 않는다 —
 * 바꾸면 기존 스레드와 매핑이 끊겨 댓글이 갈라진다. 그래서 한국어 문자열을 그대로 둔다.
 */

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
