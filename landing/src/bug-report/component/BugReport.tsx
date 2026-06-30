import { motion } from 'framer-motion';
import { Giscus } from '../../giscus/component/Giscus';
import { BUG_GISCUS } from '../../giscus/types/giscus';
import '../asset/bug-report.css';

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

const REPORT_CHECKLIST = [
  { label: '재현 방법', hint: '버그가 나타나기까지의 단계를 순서대로' },
  { label: 'AS-IS / TO-BE', hint: '무엇을 예상했고 실제로 무엇이 일어났는지' },
  { label: '환경', hint: 'macOS 버전, Apple Silicon / Intel, ASIS 버전' },
];

export function BugReport(): React.JSX.Element {
  return (
    <main className="page bug">
      <motion.header
        className="page-header"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <span className="section-eyebrow">버그 제보</span>
        <h1 className="section-title">버그를 알려주세요</h1>
        <p className="section-sub">
          아래 항목을 포함해 적어주시면 훨씬 빠르게 고칠 수 있습니다.
        </p>
      </motion.header>

      <section className="bug-section">
        <h2 className="bug-subtitle">제보 전 체크리스트</h2>
        <div className="bug-checklist">
          {REPORT_CHECKLIST.map((item, i) => (
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
          심각한 보안 이슈는 공개 댓글 대신
          <a
            className="bug-link"
            href="https://github.com/KimKyuHoi/ASIS/issues/new"
            target="_blank"
            rel="noopener noreferrer"
          >
            {' '}
            GitHub Issue
          </a>
          로 알려주세요.
        </p>
      </section>

      <section className="bug-section">
        <h2 className="bug-subtitle">버그 제보 남기기</h2>
        <p className="bug-section-desc">
          GitHub 계정으로 로그인해 제보를 남기고 진행 상황을 댓글로 확인할 수 있습니다.
        </p>
        <Giscus config={BUG_GISCUS} />
      </section>
    </main>
  );
}
