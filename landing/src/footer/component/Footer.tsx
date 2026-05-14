import { motion } from 'framer-motion';

export function Footer(): React.JSX.Element {
  return (
    <motion.footer
      className="footer"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <div className="footer-inner">
        <div className="footer-brand">
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
            <rect x="1" y="1" width="20" height="20" rx="5" stroke="var(--accent)" strokeWidth="2" />
            <rect x="5" y="5" width="5" height="5" rx="1" fill="var(--accent)" />
            <rect x="12" y="5" width="5" height="5" rx="1" fill="var(--accent)" opacity="0.5" />
            <rect x="5" y="12" width="5" height="5" rx="1" fill="var(--accent)" opacity="0.5" />
            <rect x="12" y="12" width="5" height="5" rx="1" fill="var(--accent)" opacity="0.25" />
          </svg>
          <span>ASIS</span>
        </div>
        <div className="footer-links">
          <a href="https://github.com/KimKyuHoi/ASIS" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span className="footer-sep">·</span>
          <a href="https://github.com/KimKyuHoi/ASIS/releases" target="_blank" rel="noopener noreferrer">릴리스</a>
          <span className="footer-sep">·</span>
          <a href="https://github.com/KimKyuHoi/ASIS/issues" target="_blank" rel="noopener noreferrer">버그 제보</a>
          <span className="footer-sep">·</span>
          <span>MIT License</span>
        </div>
        <p className="footer-copy">Made by KimKyuHoi</p>
      </div>
    </motion.footer>
  );
}
