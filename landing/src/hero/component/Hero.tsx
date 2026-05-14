import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

type HeroProps = {
  downloadHref: string
  downloadLabel: string
};

const WORDS_LINE1 = ['스크린샷을'];
const WORDS_LINE2 = ['더', '빠르게.'];

function AppMockup(): React.JSX.Element {
  return (
    <div className="mockup">
      <div className="mockup-chrome">
        <span className="dot dot-red" />
        <span className="dot dot-yellow" />
        <span className="dot dot-green" />
        <div className="mockup-tools-row">
          {['↖', '□', '○', '→', 'T', '✏', '◎', '⌫'].map((icon) => (
            <span key={icon} className="tool-icon">{icon}</span>
          ))}
        </div>
      </div>
      <div className="mockup-body">
        <div className="mockup-toolbar">
          {['↖', '□', '○', '╱', '→', 'T', '✏', '◉', '▦', '⌫'].map((icon, i) => (
            <span key={i} className={`sidebar-tool${i === 1 ? ' sidebar-tool--active' : ''}`}>
              {icon}
            </span>
          ))}
        </div>
        <div className="mockup-canvas">
          <div className="mock-screenshot">
            <div className="mock-ss-topbar">
              <div className="mock-dot" /><div className="mock-dot" /><div className="mock-dot" />
            </div>
            <div className="mock-ss-body">
              <div className="mock-code-line" style={{ width: '45%', background: '#58a6ff33' }} />
              <div className="mock-code-line" style={{ width: '70%', background: '#e8e8f015' }} />
              <div className="mock-code-line" style={{ width: '55%', background: '#e8e8f015' }} />
              <div className="mock-code-line" style={{ width: '80%', background: '#e8e8f015' }} />
              <div className="mock-code-line" style={{ width: '30%', background: '#3fb95033' }} />
              <div className="mock-code-line" style={{ width: '65%', background: '#e8e8f015' }} />
              <div className="mock-code-line" style={{ width: '50%', background: '#e8e8f015' }} />
              <div className="mock-code-line" style={{ width: '75%', background: '#e8e8f015' }} />
              <div className="mock-code-line" style={{ width: '40%', background: '#ff453a33' }} />
              <div className="mock-code-line" style={{ width: '60%', background: '#e8e8f015' }} />
            </div>
          </div>
          <div className="anno-rect" />
          <div className="anno-arrow">
            <svg viewBox="0 0 80 40" fill="none">
              <path d="M4 20 L60 20 M48 8 L62 20 L48 32" stroke="#5ea2ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="anno-label">API 수정 필요</div>
          <div className="anno-number">1</div>
        </div>
      </div>
    </div>
  );
}

export function Hero({ downloadHref, downloadLabel }: HeroProps): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
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
          무료 · 오픈소스 · macOS 전용
        </motion.div>

        <h1 className="hero-title">
          <span className="hero-line">
            {WORDS_LINE1.map((w, i) => (
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
            {WORDS_LINE2.map((w, i) => (
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
          캡처하고, 그 위에 바로 화살표·도형·텍스트를 그리고,<br />
          클립보드로 복사하거나 화면에 핀으로 고정하세요.
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
            GitHub에서 보기 →
          </a>
        </motion.div>

        <motion.p
          className="hero-compat"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.05 }}
        >
          macOS 13 Ventura 이상 · Apple Silicon &amp; Intel
        </motion.p>

        <motion.div
          className="hero-mockup-wrap"
          initial={{ opacity: 0, y: 48, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.5, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="mockup-glow" />
          <AppMockup />
        </motion.div>
      </motion.div>
    </section>
  );
}
