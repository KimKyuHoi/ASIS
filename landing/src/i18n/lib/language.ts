export type Language = 'ko' | 'en';

const STORAGE_KEY = 'asis-lang';

function isLanguage(value: string | null): value is Language {
  return value === 'ko' || value === 'en';
}

/**
 * 초기 언어 결정: 저장된 값이 유효하면 그걸 쓰고,
 * 없으면 브라우저 언어가 한국어일 때만 'ko', 그 외에는 'en'.
 */
function resolveInitial(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isLanguage(stored)) return stored;
  return navigator.language.startsWith('ko') ? 'ko' : 'en';
}

let current: Language = resolveInitial();
const listeners = new Set<() => void>();

// index.html 의 하드코딩된 lang="ko" 를 실제 초기 언어로 맞춘다.
document.documentElement.lang = current;

export function getLanguage(): Language {
  return current;
}

export function setLanguage(next: Language): void {
  if (next === current) return;
  current = next;
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
  for (const listener of listeners) listener();
}

export function subscribeLanguage(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
