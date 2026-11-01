export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'asis-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function isPreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** 저장값이 없으면 'system' — 앱의 appearance 기본값(DEFAULT_MISC.appearance)과 같은 결. */
function resolveInitial(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isPreference(stored) ? stored : 'system';
}

let preference: ThemePreference = resolveInitial();
let resolved: ResolvedTheme = resolve();
const listeners = new Set<() => void>();

function resolve(): ResolvedTheme {
  if (preference !== 'system') return preference;
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

applyToDocument();

media.addEventListener('change', () => {
  const next = resolve();
  if (next === resolved) return;
  resolved = next;
  applyToDocument();
  emit();
});

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
