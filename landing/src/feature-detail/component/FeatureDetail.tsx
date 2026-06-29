import { motion } from 'framer-motion';
import {
  ANNOTATION_TOOLS,
  WORKFLOW_FEATURES,
  SHORTCUTS,
  PERMISSIONS,
  type ToolSpec,
} from '../lib/feature-detail-data';
import '../asset/feature-detail.css';

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

function ToolCard({ tool, index }: { tool: ToolSpec; index: number }): React.JSX.Element {
  return (
    <motion.article
      className="fd-card"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.05, 0.3), ease: EASE }}
    >
      <div className="fd-card-head">
        <span className="fd-card-icon" aria-hidden="true">
          {tool.icon}
        </span>
        <div className="fd-card-heading">
          <h3 className="fd-card-name">{tool.name}</h3>
          <p className="fd-card-summary">{tool.summary}</p>
        </div>
        {tool.shortcut ? <kbd className="fd-kbd">{tool.shortcut}</kbd> : null}
      </div>
      <ul className="fd-card-details">
        {tool.details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </motion.article>
  );
}

export function FeatureDetail(): React.JSX.Element {
  return (
    <main className="page fd">
      <motion.header
        className="fd-header"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <span className="section-eyebrow">기능 상세</span>
        <h1 className="section-title">ASIS가 할 수 있는 모든 것</h1>
        <p className="section-sub">
          캡처부터 어노테이션, 공유까지 — 각 도구가 무엇을 하는지 자세히 살펴보세요.
        </p>
      </motion.header>

      <section className="fd-section">
        <h2 className="fd-section-title">어노테이션 도구</h2>
        <p className="fd-section-desc">
          캡처 위에 바로 그리는 8가지 도구. 모두 단축키로 즉시 전환됩니다.
        </p>
        <div className="fd-grid">
          {ANNOTATION_TOOLS.map((tool, i) => (
            <ToolCard key={tool.name} tool={tool} index={i} />
          ))}
        </div>
      </section>

      <section className="fd-section">
        <h2 className="fd-section-title">캡처 &amp; 워크플로우</h2>
        <p className="fd-section-desc">
          캡처를 시작하고 결과물을 활용하는 흐름 전체를 한 앱에서.
        </p>
        <div className="fd-grid">
          {WORKFLOW_FEATURES.map((tool, i) => (
            <ToolCard key={tool.name} tool={tool} index={i} />
          ))}
        </div>
      </section>

      <section className="fd-section fd-section--split">
        <div className="fd-shortcuts">
          <h2 className="fd-section-title">단축키</h2>
          <table className="fd-table">
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={s.action}>
                  <td className="fd-table-key">
                    <kbd className="fd-kbd">{s.keys}</kbd>
                  </td>
                  <td className="fd-table-action">{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fd-perms">
          <h2 className="fd-section-title">필요 권한</h2>
          <p className="fd-section-desc">앱 최초 실행 시 아래 권한을 요청합니다.</p>
          <ul className="fd-perm-list">
            {PERMISSIONS.map((p) => (
              <li key={p.name} className="fd-perm-item">
                <span className="fd-perm-name">{p.name}</span>
                <span className="fd-perm-use">{p.use}</span>
              </li>
            ))}
          </ul>
          <a
            className="btn-primary fd-cta"
            href="https://github.com/KimKyuHoi/ASIS/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
          >
            macOS 다운로드 →
          </a>
        </div>
      </section>
    </main>
  );
}
