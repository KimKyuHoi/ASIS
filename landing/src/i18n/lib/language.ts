export type Language = 'ko' | 'en';

export const LANGUAGES: Language[] = ['en', 'ko'];

/**
 * 언어는 URL(/ASIS/ vs /ASIS/ko/)로 정해진다. 여기 저장하는 값은 "다음에 어느 언어 URL 로
 * 보낼지"에 대한 사용자 선택뿐이다 — index.html 의 인라인 스크립트가 같은 키를 읽어
 * 첫 방문 언어를 고른다(키를 바꾸면 거기도 같이 바꿀 것).
 */
export const LANG_STORAGE_KEY = 'asis-lang';

export function rememberLanguage(lang: Language): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // 저장소가 막힌 브라우저(사생활 보호 모드 등) — 링크 이동만으로도 언어는 바뀐다.
  }
}
