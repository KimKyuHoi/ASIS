import type { Language } from './language';

/**
 * ko/en 두 벌의 문자열(또는 데이터)을 언어별로 조회 가능한 형태로 묶는 헬퍼.
 * `en` 은 `NoInfer` 로 `ko` 의 구조를 그대로 강제받으므로 한쪽만 필드를 빠뜨리면
 * 타입 에러가 난다(번역 누락 방지).
 */
export function defineDict<T>(dict: { ko: T; en: NoInfer<T> }): Record<Language, T> {
  return dict;
}
