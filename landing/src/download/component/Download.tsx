import { motion } from 'framer-motion';

type DownloadProps = {
  downloadHref: string
  downloadLabel: string
};

export function Download({ downloadHref, downloadLabel }: DownloadProps): React.JSX.Element {
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
        <p className="download-sub">
          MIT 라이선스 · macOS 13 Ventura 이상 · Apple Silicon &amp; Intel 지원
        </p>

        <div className="download-buttons">
          <a className="btn-primary btn-large" href={downloadHref}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v10M4 7l4 4 4-4M2 14h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {downloadLabel}
          </a>
          <a
            className="btn-ghost btn-large"
            href="https://github.com/KimKyuHoi/ASIS"
            target="_blank"
            rel="noopener noreferrer"
          >
            소스코드 보기 →
          </a>
        </div>

        <div className="download-steps">
          {[
            'DMG 파일 다운로드',
            'Applications 폴더로 드래그',
            'ASIS 더블클릭 → 경고창 "확인"',
            '시스템 설정 → 개인정보 보호 및 보안 → "그래도 열기"',
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
        <pre className="download-code">xattr -cr /Applications/ASIS.app</pre>
      </motion.div>
    </section>
  );
}
