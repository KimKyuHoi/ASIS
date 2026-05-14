import { useEffect, useState } from 'react';

const FEATURES: { symbol: string; title: string; desc: string }[] = [
  {
    symbol: '⌘',
    title: '글로벌 단축키',
    desc: '어느 앱에서든 단축키 한 번으로 영역·전체화면·윈도우 캡처를 즉시 실행합니다.',
  },
  {
    symbol: '✦',
    title: '인라인 어노테이션',
    desc: '화살표·사각형·원·펜·텍스트·번호마커·지우개·하이라이트·블러·모자이크를 지원합니다.',
  },
  {
    symbol: '◈',
    title: 'Pin to Screen',
    desc: '어노테이션한 이미지를 항상 위에 띄워 참고하면서 다른 작업을 계속할 수 있습니다.',
  },
  {
    symbol: '▶',
    title: 'GIF 녹화',
    desc: '영역을 선택해 시퀀스 GIF 또는 영상 GIF로 녹화하고 바로 저장합니다.',
  },
  {
    symbol: '◎',
    title: 'Color Picker',
    desc: '영역 선택 중 화면의 어떤 색이든 픽셀 단위로 확대·확인·복사할 수 있습니다.',
  },
  {
    symbol: '◷',
    title: '캡처 히스토리',
    desc: '세션 중 복사하거나 핀한 캡처를 트레이 메뉴에서 바로 다시 불러올 수 있습니다.',
  },
];

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'DMG 파일 다운로드',
    body: (
      <>
        GitHub Releases에서 본인의 Mac에 맞는 파일을 받으세요.
        <br />
        <span className="step__note">
          Apple Silicon(M1~) → arm64.dmg &nbsp;|&nbsp; Intel → x64.dmg
        </span>
      </>
    ),
  },
  {
    title: 'Applications 폴더로 드래그',
    body: 'DMG를 열고 ASIS를 Applications 폴더로 드래그합니다.',
  },
  {
    title: 'Gatekeeper 경고 우회',
    body: (
      <>
        서명되지 않은 앱입니다. Finder에서{' '}
        <strong>우클릭 → 열기 → 열기</strong>를 누르면 이후 정상 실행됩니다.
        <br />
        <span className="step__note">
          또는 시스템 설정 → 개인정보 보호 및 보안 → &ldquo;그래도 열기&rdquo;
        </span>
      </>
    ),
  },
  {
    title: '권한 허용',
    body: '첫 실행 시 화면 녹화와 손쉬운 사용 권한을 모두 허용합니다.',
  },
];

export default function App(): React.JSX.Element {
  const [downloadHref, setDownloadHref] = useState(
    'https://github.com/KimKyuHoi/ASIS/releases/latest',
  );
  const [downloadLabel, setDownloadLabel] = useState('macOS 다운로드');

  useEffect(() => {
    fetch('https://api.github.com/repos/KimKyuHoi/ASIS/releases/latest')
      .then((r) => r.json())
      .then(
        (data: {
          tag_name: string;
          assets: { name: string; browser_download_url: string }[];
        }) => {
          const assets = data.assets ?? [];
          const arm = assets.find((a) => a.name.endsWith('-arm64.dmg'));
          const intel = assets.find((a) => a.name.endsWith('-x64.dmg'));
          const best = arm ?? intel;
          if (!best) return;
          setDownloadHref(best.browser_download_url);
          setDownloadLabel(`macOS 다운로드 (${data.tag_name})`);
        },
      )
      .catch(() => {});
  }, []);

  return (
    <>
      <section className="hero">
        <div className="badge">
          <span className="badge__dot" />
          macOS 전용 · 무료 오픈소스
        </div>

        <h1 className="hero__title">
          스크린샷을
          <br />
          <span className="hero__title--accent">더 빠르게.</span>
        </h1>

        <p className="hero__sub">
          캡처하고, 그 위에 바로 화살표·도형·텍스트를 그리고,
          <br />
          클립보드로 복사하거나 화면에 핀으로 고정하세요.
        </p>

        <div className="hero__actions">
          <a className="btn btn--primary" href={downloadHref}>
            ↓ {downloadLabel}
          </a>
          <a
            className="btn btn--ghost"
            href="https://github.com/KimKyuHoi/ASIS"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub →
          </a>
        </div>

        <p className="hero__note">macOS 13 Ventura 이상 · Apple Silicon &amp; Intel 지원</p>
      </section>

      <section className="features">
        {FEATURES.map(({ symbol, title, desc }) => (
          <div key={title} className="feature-card">
            <span className="feature-card__symbol">{symbol}</span>
            <h3 className="feature-card__title">{title}</h3>
            <p className="feature-card__desc">{desc}</p>
          </div>
        ))}
      </section>

      <section className="install">
        <h2 className="install__title">설치 방법</h2>
        <div className="steps">
          {STEPS.map(({ title, body }, i) => (
            <div key={i} className="step">
              <span className="step__num">{i + 1}</span>
              <div className="step__body">
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <span>MIT License</span>
        <span className="footer__sep">·</span>
        <a href="https://github.com/KimKyuHoi/ASIS" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        <span className="footer__sep">·</span>
        <a
          href="https://github.com/KimKyuHoi/ASIS/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          버그 제보
        </a>
        <span className="footer__sep">·</span>
        <span>Made by KimKyuHoi</span>
      </footer>
    </>
  );
}
