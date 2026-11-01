import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { useLanguage } from '../../i18n/hook/useLanguage';
import { HERO_STRINGS } from '../lib/strings';

type HeroProps = {
  downloadHref: string
  version: string
};

// 툴바 아이콘 순서는 앱 에디터 툴바(src/shared/editor-hotkeys.ts EDITOR_TOOLS)와 같다.
const TOOL_ICONS = ['↖', '□', '○', '→', '╱', '✎', 'T', '①', '▬', '◌', '▦', '⌫'];
const ACTIVE_TOOL = 1;
// 목업 속 "캡처된 화면" 의 코드 줄 — 너비(%)와 강조 종류만 데코로 고정한다.
const CODE_LINES: [number, string][] = [
  [45, 'accent'], [70, ''], [55, ''], [80, ''], [30, 'green'],
  [65, ''], [50, ''], [75, ''], [40, 'red'], [60, ''],
];

type AppMockupProps = { label: string; title: string; copy: string };

function AppMockup({ label, title, copy }: AppMockupProps): React.JSX.Element {
  return (
    <div className="mockup">
      <div className="mockup-chrome">
        <span className="traffic">
          <span className="dot dot-red" />
          <span className="dot dot-yellow" />
          <span className="dot dot-green" />
        </span>
        <span className="mockup-title">{title}</span>
      </div>
      <div className="mockup-toolbar">
        <div className="mockup-tools">
          {TOOL_ICONS.map((icon, i) => (
            <span key={icon} className={`mockup-tool${i === ACTIVE_TOOL ? ' mockup-tool--active' : ''}`}>
              {icon}
            </span>
          ))}
        </div>
        <span className="mockup-action">📌</span>
        <span className="mockup-action mockup-action--primary">{copy}</span>
      </div>
      <div className="mockup-canvas">
        <div className="mock-screenshot">
          <div className="mock-ss-topbar">
            <div className="mock-dot" /><div className="mock-dot" /><div className="mock-dot" />
          </div>
          <div className="mock-ss-body">
            {CODE_LINES.map(([width, tone], i) => (
              <div
                key={i}
                className={`mock-code-line${tone ? ` mock-code-line--${tone}` : ''}`}
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </div>
        <div className="anno-rect" />
        <div className="anno-arrow">
          <svg viewBox="0 0 80 40" fill="none">
            <path d="M4 20 L60 20 M48 8 L62 20 L48 32" stroke="var(--anno-red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="anno-label">{label}</div>
        <div className="anno-number">1</div>
      </div>
    </div>
  );
}

export function Hero({ downloadHref, version }: HeroProps): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const lang = useLanguage();
  const t = HERO_STRINGS[lang];
  const downloadLabel = version ? `${t.downloadLabel} (${version})` : t.downloadLabel;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <section className="hero" ref={ref}>
      <motion.div className="hero-inner" style={{ y, opacity }}>
        <motion.div
          className="badge"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <span className="badge-dot" />
          {t.badge}
        </motion.div>

        <h1 className="hero-title">
          <span className="hero-line">
            {t.titleLine1.map((w, i) => (
              <motion.span
                key={w}
                className="hero-word"
                initial={{ opacity: 0, y: 32 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.25 + i * 0.08, ease: [0.32, 0.72, 0, 1] }}
              >
                {w}
              </motion.span>
            ))}
          </span>
          <span className="hero-line hero-line--accent">
            {t.titleLine2.map((w, i) => (
              <motion.span
                key={w}
                className="hero-word"
                initial={{ opacity: 0, y: 32 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.4 + i * 0.1, ease: [0.32, 0.72, 0, 1] }}
              >
                {w}
              </motion.span>
            ))}
          </span>
        </h1>

        <motion.p
          className="hero-sub"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.7 }}
        >
          {t.subLine1}<br />
          {t.subLine2}
        </motion.p>

        <motion.div
          className="hero-actions"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.85 }}
        >
          <a className="btn-primary" href={downloadHref}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1v9M3.5 6.5l4 4 4-4M2 13h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {downloadLabel}
          </a>
          <a
            className="btn-ghost"
            href="https://github.com/KimKyuHoi/ASIS"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.githubLabel}
          </a>
        </motion.div>

        <motion.p
          className="hero-compat"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.05 }}
        >
          {t.compat}
        </motion.p>

        <motion.div
          className="hero-mockup-wrap"
          initial={{ opacity: 0, y: 48, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.5, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="mockup-glow" />
          <AppMockup label={t.mockupLabel} title={t.mockupTitle} copy={t.mockupCopy} />
        </motion.div>
      </motion.div>
    </section>
  );
}
