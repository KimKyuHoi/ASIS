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
