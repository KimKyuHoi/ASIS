import { motion } from 'framer-motion';
import { useDownloadCount } from '../hook/useDownloadCount';
import { useLanguage } from '../../i18n/hook/useLanguage';
import { DOWNLOAD_STRINGS } from '../lib/strings';

type DownloadProps = {
  armHref: string;
  intelHref: string;
  version: string;
};

export function Download({ armHref, intelHref, version }: DownloadProps): React.JSX.Element {
  const downloadCount = useDownloadCount();
  const lang = useLanguage();
  const t = DOWNLOAD_STRINGS[lang];

  return (
    <section className="download" id="download">
      <motion.div
        className="download-inner"
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
      >
        <div className="download-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="var(--accent-dim)" />
            <path
              d="M24 10v18M16 22l8 8 8-8M13 36h22"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 className="download-title">{t.title}</h2>
        <p className="download-sub">{t.sub}</p>

        {downloadCount !== null && downloadCount > 0 ? (
          <div className="download-count">
            {t.countPrefix}
            <span className="download-count-num">{downloadCount.toLocaleString()}</span>
            {t.countSuffix}
          </div>
        ) : null}

        <div className="download-requirements">
          <div className="dl-req-item">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="2" width="11" height="8" rx="1.5" stroke="var(--accent)" strokeWidth="1.4" />
              <path d="M4.5 12h5" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {t.reqScreen}
          </div>
          <div className="dl-req-item">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="var(--accent)" strokeWidth="1.4" />
              <path d="M4.5 7l2 2 3-3" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.reqArch}
          </div>
          <div className="dl-req-item">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 4.5C2 3.12 3.12 2 4.5 2h5C10.88 2 12 3.12 12 4.5v5C12 10.88 10.88 12 9.5 12h-5C3.12 12 2 10.88 2 9.5v-5z"
                stroke="var(--accent)"
                strokeWidth="1.4"
              />
              <path d="M5 7l1.5 1.5L9 5.5" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.reqPermission}
          </div>
        </div>

        <div className="download-arch-buttons">
          <a className="download-arch-btn download-arch-btn--primary" href={armHref}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M10 2v11M5 8.5l5 5 5-5M3 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="download-arch-text">
              <span className="download-arch-label">Apple Silicon</span>
              <span className="download-arch-sub">{version ? `${version} · arm64` : 'arm64'}</span>
            </div>
          </a>
          <a className="download-arch-btn download-arch-btn--secondary" href={intelHref}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M10 2v11M5 8.5l5 5 5-5M3 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="download-arch-text">
              <span className="download-arch-label">Intel</span>
              <span className="download-arch-sub">{version ? `${version} · x64` : 'x64'}</span>
            </div>
          </a>
        </div>

        <div className="download-steps">
          {t.steps.map((step, i) => (
            <div key={i} className="dl-step">
              <span className="dl-step-num">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
