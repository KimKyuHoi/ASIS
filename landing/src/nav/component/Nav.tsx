import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ROUTES, type Route } from '../types/route';
import { NAV_STRINGS } from '../lib/strings';
import { useLanguage } from '../../i18n/hook/useLanguage';
import { rememberLanguage } from '../../i18n/lib/language';
import { pagePath } from '../../page/lib/page-path';
import { useResolvedTheme } from '../../theme/hook/useTheme';
import { setThemePreference } from '../../theme/lib/theme';

export function Nav({ route }: { route: Route }): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false);
  const lang = useLanguage();
  const t = NAV_STRINGS[lang];
  const theme = useResolvedTheme();
  const themeLabel = theme === 'dark' ? t.themeToLight : t.themeToDark;
  const otherLang = lang === 'ko' ? 'en' : 'ko';

  useEffect(() => {
    const handler = (): void => setScrolled(window.scrollY > 48);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <motion.nav
      className={`nav${scrolled ? ' nav--blur' : ''}`}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
    >
      <a href={pagePath({ route: 'home', lang })} className="nav-logo">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="1" y="1" width="20" height="20" rx="5" stroke="var(--accent)" strokeWidth="2" />
          <rect x="5" y="5" width="5" height="5" rx="1" fill="var(--accent)" />
          <rect x="12" y="5" width="5" height="5" rx="1" fill="var(--accent)" opacity="0.5" />
          <rect x="5" y="12" width="5" height="5" rx="1" fill="var(--accent)" opacity="0.5" />
          <rect x="12" y="12" width="5" height="5" rx="1" fill="var(--accent)" opacity="0.25" />
        </svg>
        <span className="nav-logo-text">ASIS</span>
      </a>
      <div className="nav-links">
        {ROUTES.map((r) => (
          <a
            key={r}
            href={pagePath({ route: r, lang })}
            className={`nav-tab${route === r ? ' nav-tab--active' : ''}`}
            aria-current={route === r ? 'page' : undefined}
          >
            {t.labels[r]}
          </a>
        ))}
        {/* 언어 전환 = 같은 탭의 다른 언어 URL 로 이동. 선택을 저장해 다음 방문에도 그 언어로 보낸다. */}
        <a
          href={pagePath({ route, lang: otherLang })}
          hrefLang={otherLang}
          className="nav-lang"
          onClick={() => rememberLanguage(otherLang)}
          aria-label={t.languageToggleAria}
        >
          <span className={`nav-lang-opt${lang === 'ko' ? ' nav-lang-opt--active' : ''}`}>KO</span>
          <span className="nav-lang-sep">/</span>
          <span className={`nav-lang-opt${lang === 'en' ? ' nav-lang-opt--active' : ''}`}>EN</span>
        </a>
        <button
          type="button"
          className="nav-theme"
          onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
          aria-label={themeLabel}
          title={themeLabel}
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <a
          href="https://github.com/KimKyuHoi/ASIS"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-github"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          <span className="nav-github-label">GitHub</span>
        </a>
      </div>
    </motion.nav>
  );
}
