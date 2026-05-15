import { useState } from 'react';
import { motion } from 'framer-motion';

const INSTALL_CMD =
  'curl -fsSL https://raw.githubusercontent.com/KimKyuHoi/ASIS/main/landing/public/ASIS-installer.command | bash';

type DownloadProps = {
  armHref: string;
  intelHref: string;
  version: string;
};

export function Download({ armHref, intelHref, version }: DownloadProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = (): void => {
    navigator.clipboard.writeText(INSTALL_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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

        <h2 className="download-title">지금 무료로 시작하세요</h2>
        <p className="download-sub">MIT 라이선스 · 무료 · 오픈소스</p>

        <div className="download-requirements">
          <div className="dl-req-item">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect
                x="1.5"
                y="2"
                width="11"
                height="8"
                rx="1.5"
                stroke="var(--accent)"
                strokeWidth="1.4"
              />
              <path
                d="M4.5 12h5"
                stroke="var(--accent)"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            macOS 13 Ventura 이상
          </div>
          <div className="dl-req-item">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="var(--accent)" strokeWidth="1.4" />
              <path
                d="M4.5 7l2 2 3-3"
                stroke="var(--accent)"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Apple Silicon &amp; Intel
          </div>
          <div className="dl-req-item">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 4.5C2 3.12 3.12 2 4.5 2h5C10.88 2 12 3.12 12 4.5v5C12 10.88 10.88 12 9.5 12h-5C3.12 12 2 10.88 2 9.5v-5z"
                stroke="var(--accent)"
                strokeWidth="1.4"
              />
              <path
                d="M5 7l1.5 1.5L9 5.5"
                stroke="var(--accent)"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            화면 녹화 권한 필요
          </div>
        </div>

        <div className="download-curl">
          <code className="download-curl-cmd">{INSTALL_CMD}</code>
          <button type="button" className="download-curl-copy" onClick={handleCopy}>
            {copied ? '✓ 복사됨' : '복사'}
          </button>
        </div>

        <div className="download-steps">
          {[
            'Terminal 앱 실행',
            '위 명령어 붙여넣기 → Enter',
            '설치 마법사에서 "계속" → "설치" → 암호 입력',
            'Launchpad 또는 /Applications 에서 ASIS 실행',
            '화면 녹화 권한 허용',
          ].map((step, i) => (
            <div key={i} className="dl-step">
              <span className="dl-step-num">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>

        <p className="download-note">
          {version && `${version} · `}직접 PKG 파일을 설치하려면{' '}
          <a href={armHref} className="download-link">
            Apple Silicon
          </a>
          {' · '}
          <a href={intelHref} className="download-link">
            Intel
          </a>
        </p>
      </motion.div>
    </section>
  );
}
