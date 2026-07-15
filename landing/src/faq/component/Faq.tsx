import { motion } from 'framer-motion';
import { Giscus } from '../../giscus/component/Giscus';
import { FAQ_GISCUS } from '../../giscus/types/giscus';
import { FAQ_ENTRIES } from '../lib/faq-data';
import { FAQ_STRINGS } from '../lib/strings';
import { useLanguage } from '../../i18n/hook/useLanguage';
import '../asset/faq.css';

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export function Faq(): React.JSX.Element {
  const lang = useLanguage();
  const t = FAQ_STRINGS[lang];
  const entries = FAQ_ENTRIES[lang];

  return (
    <main className="page faq">
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

      <section className="faq-section">
        <h2 className="faq-subtitle">{t.faqSubtitle}</h2>
        <div className="faq-list">
          {entries.map((entry) => (
            <details key={entry.q} className="faq-item">
              <summary className="faq-q">
                <span>{entry.q}</span>
                <span className="faq-chevron" aria-hidden="true">
                  ＋
                </span>
              </summary>
              <p className="faq-a">{entry.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="faq-section">
        <h2 className="faq-subtitle">{t.contactSubtitle}</h2>
        <p className="faq-section-desc">{t.contactDesc}</p>
        <Giscus config={FAQ_GISCUS} />
      </section>
    </main>
  );
}
