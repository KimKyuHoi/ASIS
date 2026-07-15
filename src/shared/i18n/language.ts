/**
 * 앱 전역 언어 상태 — main/renderer 양쪽에서 동작하는 DOM·Electron 무관 store.
 *
 * side-effects.md — React 는 useSyncExternalStore 기반 훅(use-language.ts)으로만
 * 읽고, main 은 subscribeLanguage 로 Tray/메뉴 재빌드를 건다.
 */
export type Language = 'ko' | 'en';

export function isLanguage(value: unknown): value is Language {
  return value === 'ko' || value === 'en';
}

let current: Language = 'ko';
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

/** 현재 언어 변경 + 구독자 통지. 같은 값이면 no-op. */
export function setLanguage(lang: Language): void {
  if (lang === current) return;
  current = lang;
  for (const listener of listeners) listener();
}

/** 언어 변경 구독. 반환값은 cleanup. */
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * ko 를 기준 스키마로 en 이 같은 키·값 형태를 갖도록 강제하는 사전 헬퍼.
 * NoInfer 로 en 쪽 추론을 막아 ko 와의 키 불일치가 컴파일 에러로 잡힌다.
 * 값에는 문자열뿐 아니라 보간 함수((n) => `핀 ${n}개 닫음`)도 허용된다.
 */
export function defineDict<T>(dict: { ko: T; en: NoInfer<T> }): Record<Language, T> {
  return dict;
}
