import { motion } from 'framer-motion';
import {
  ANNOTATION_TOOLS,
  WORKFLOW_FEATURES,
  SHORTCUTS,
  PERMISSIONS,
  type ToolSpec,
} from '../lib/feature-detail-data';
import { FEATURE_DETAIL_STRINGS } from '../lib/strings';
import { useLanguage } from '../../i18n/hook/useLanguage';
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
  const lang = useLanguage();
  const t = FEATURE_DETAIL_STRINGS[lang];
  const annotationTools = ANNOTATION_TOOLS[lang];
  const workflowFeatures = WORKFLOW_FEATURES[lang];
  const shortcuts = SHORTCUTS[lang];
  const permissions = PERMISSIONS[lang];

  return (
    <main className="page fd">
      <motion.header
        className="fd-header"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <span className="section-eyebrow">{t.eyebrow}</span>
        <h1 className="section-title">{t.title}</h1>
        <p className="section-sub">{t.sub}</p>
      </motion.header>

      <section className="fd-section">
        <h2 className="fd-section-title">{t.annoTitle}</h2>
        <p className="fd-section-desc">{t.annoDesc}</p>
        <div className="fd-grid">
          {annotationTools.map((tool, i) => (
            <ToolCard key={tool.name} tool={tool} index={i} />
          ))}
        </div>
      </section>

      <section className="fd-section">
        <h2 className="fd-section-title">{t.workflowTitle}</h2>
        <p className="fd-section-desc">{t.workflowDesc}</p>
        <div className="fd-grid">
          {workflowFeatures.map((tool, i) => (
            <ToolCard key={tool.name} tool={tool} index={i} />
          ))}
        </div>
      </section>

      <section className="fd-section fd-section--split">
        <div className="fd-shortcuts">
          <h2 className="fd-section-title">{t.shortcutsTitle}</h2>
          <table className="fd-table">
            <tbody>
              {shortcuts.map((s) => (
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
          <h2 className="fd-section-title">{t.permsTitle}</h2>
          <p className="fd-section-desc">{t.permsDesc}</p>
          <ul className="fd-perm-list">
            {permissions.map((p) => (
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
            {t.cta}
          </a>
        </div>
      </section>
    </main>
  );
}
