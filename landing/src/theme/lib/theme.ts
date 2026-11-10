export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** index.html 의 인라인 스크립트도 같은 키로 첫 페인트 전에 data-theme 을 맞춘다. */
const STORAGE_KEY = 'asis-theme';

/**
 * 빌드 때 프리렌더(Node)에는 window 가 없다. 그때는 store 를 만들지 않고, 화면은
 * 서버 스냅숏(useResolvedTheme)으로 그린 뒤 브라우저에서 hydrate 하며 실제 값으로 바뀐다.
 */
const media: MediaQueryList | null =
  typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');

function isPreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** 저장값이 없으면 'system' — 앱의 appearance 기본값(DEFAULT_MISC.appearance)과 같은 결. */
function resolveInitial(): ThemePreference {
  if (media === null) return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  return isPreference(stored) ? stored : 'system';
}

/** 프리렌더 HTML 에 쓰는 테마 — 버튼 아이콘만 다르고, 색은 CSS 가 OS 설정을 따른다. */
export const SERVER_THEME: ResolvedTheme = 'light';

let preference: ThemePreference = resolveInitial();
let resolved: ResolvedTheme = resolve();
const listeners = new Set<() => void>();

function resolve(): ResolvedTheme {
  if (preference !== 'system') return preference;
  if (media === null) return SERVER_THEME;
  return media.matches ? 'dark' : 'light';
}

/**
 * CSS 는 data-theme 이 없으면 prefers-color-scheme 을 따른다.
 * 'system' 일 때는 속성을 지워 OS 전환이 CSS 만으로도 반영되게 한다.
 */
function applyToDocument(): void {
  const root = document.documentElement;
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
  root.style.colorScheme = resolved;
}

function emit(): void {
  for (const listener of listeners) listener();
}

if (media !== null) {
  applyToDocument();
  media.addEventListener('change', () => {
    const next = resolve();
    if (next === resolved) return;
    resolved = next;
    applyToDocument();
    emit();
  });
}

export function getResolvedTheme(): ResolvedTheme {
  return resolved;
}

export function setThemePreference(next: ThemePreference): void {
  if (next === preference) return;
  preference = next;
  resolved = resolve();
  localStorage.setItem(STORAGE_KEY, next);
  applyToDocument();
  emit();
}

export function subscribeTheme(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
