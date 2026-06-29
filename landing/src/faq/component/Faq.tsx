import { motion } from 'framer-motion';
import { Giscus } from '../../giscus/component/Giscus';
import { FAQ_GISCUS } from '../../giscus/types/giscus';
import { FAQ_ENTRIES } from '../lib/faq-data';
import '../asset/faq.css';

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export function Faq(): React.JSX.Element {
  return (
    <main className="page faq">
      <motion.header
        className="page-header"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <span className="section-eyebrow">FAQ · 문의</span>
        <h1 className="section-title">자주 묻는 질문 &amp; 문의</h1>
        <p className="section-sub">
          먼저 아래 FAQ를 확인하고, 원하는 기능이나 수정 요청은 댓글로 남겨주세요.
        </p>
      </motion.header>

      <section className="faq-section">
        <h2 className="faq-subtitle">자주 묻는 질문</h2>
        <div className="faq-list">
          {FAQ_ENTRIES.map((entry) => (
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
        <h2 className="faq-subtitle">기능 · 수정 문의</h2>
        <p className="faq-section-desc">
          원하는 기능이나 고쳐졌으면 하는 점을 남겨주세요. GitHub 계정으로 로그인해
          질문·답변을 주고받을 수 있습니다.
        </p>
        <Giscus config={FAQ_GISCUS} />
      </section>
    </main>
  );
}
