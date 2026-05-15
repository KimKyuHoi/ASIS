import { motion } from 'framer-motion';

type DownloadProps = {
  armHref: string;
  intelHref: string;
  version: string;
};

const DownloadIcon = (): React.JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path
      d="M10 2v12M6 10l4 4 4-4M3 17h14"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function Download({ armHref, intelHref, version }: DownloadProps): React.JSX.Element {
  const vSuffix = version ? ` ${version}` : '';

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
              <rect x="1.5" y="2" width="11" height="8" rx="1.5" stroke="var(--accent)" strokeWidth="1.4" />
              <path d="M4.5 12h5" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            macOS 13 Ventura 이상
          </div>
          <div className="dl-req-item">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="var(--accent)" strokeWidth="1.4" />
              <path d="M4.5 7l2 2 3-3" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Apple Silicon &amp; Intel
          </div>
          <div className="dl-req-item">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4.5C2 3.12 3.12 2 4.5 2h5C10.88 2 12 3.12 12 4.5v5C12 10.88 10.88 12 9.5 12h-5C3.12 12 2 10.88 2 9.5v-5z" stroke="var(--accent)" strokeWidth="1.4" />
              <path d="M5 7l1.5 1.5L9 5.5" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            화면 녹화 권한 필요
          </div>
        </div>

        <div className="download-arch-buttons">
          <a className="download-arch-btn download-arch-btn--primary" href={armHref}>
            <DownloadIcon />
            <span className="download-arch-label">Apple Silicon{vSuffix}</span>
            <span className="download-arch-sub">M1 · M2 · M3 · M4</span>
          </a>
          <a className="download-arch-btn download-arch-btn--secondary" href={intelHref}>
            <DownloadIcon />
            <span className="download-arch-label">Intel Mac{vSuffix}</span>
            <span className="download-arch-sub">x86_64</span>
          </a>
        </div>

        <div className="download-steps">
          {[
            'PKG 파일 다운로드',
            '파일 마우스 우클릭 → "열기" 선택',
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
          <strong>&ldquo;손상되었기 때문에 열 수 없습니다&rdquo;</strong> 오류가 뜨면
          터미널에서 아래 명령어를 실행한 뒤 다시 시도하세요.
        </p>
        <pre className="download-code">xattr -cr ~/Downloads/ASIS-*.pkg</pre>
      </motion.div>
    </section>
  );
}
