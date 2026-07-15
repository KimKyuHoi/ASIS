import { motion } from 'framer-motion';
import { Giscus } from '../../giscus/component/Giscus';
import { BUG_GISCUS } from '../../giscus/types/giscus';
import { BUG_REPORT_STRINGS } from '../lib/strings';
import { useLanguage } from '../../i18n/hook/useLanguage';
import '../asset/bug-report.css';

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export function BugReport(): React.JSX.Element {
  const lang = useLanguage();
  const t = BUG_REPORT_STRINGS[lang];

  return (
    <main className="page bug">
      <motion.header
        className="page-header"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <span className="section-eyebrow">{t.eyebrow}</span>
        <h1 className="section-title">{t.title}</h1>
        <p className="section-sub">{t.sub}</p>
      </motion.header>

      <section className="bug-section">
        <h2 className="bug-subtitle">{t.checklistTitle}</h2>
        <div className="bug-checklist">
          {t.checklist.map((item, i) => (
            <div key={item.label} className="bug-check-item">
              <span className="bug-check-num">{i + 1}</span>
              <div className="bug-check-text">
                <span className="bug-check-label">{item.label}</span>
                <span className="bug-check-hint">{item.hint}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="bug-note">
          {t.noteBefore}
          <a
            className="bug-link"
            href="https://github.com/KimKyuHoi/ASIS/issues/new"
            target="_blank"
            rel="noopener noreferrer"
          >
            {' '}
            {t.noteLink}
          </a>
          {t.noteAfter}
        </p>
      </section>

      <section className="bug-section">
        <h2 className="bug-subtitle">{t.submitTitle}</h2>
        <p className="bug-section-desc">{t.submitDesc}</p>
        <Giscus config={BUG_GISCUS} />
      </section>
    </main>
  );
}
