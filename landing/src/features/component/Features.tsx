import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

type Feature = {
  num: string
  title: string
  desc: string
  detail: string
  visual: React.ReactNode
};

function CaptureVisual(): React.JSX.Element {
  return (
    <div className="fv-capture">
      <div className="fv-screen">
        <div className="fv-overlay" />
        <div className="fv-selection">
          <span className="fv-handle fv-handle-tl" />
          <span className="fv-handle fv-handle-tr" />
          <span className="fv-handle fv-handle-bl" />
          <span className="fv-handle fv-handle-br" />
          <div className="fv-size-badge">642 × 380 px</div>
        </div>
        <div className="fv-crosshair-h" />
        <div className="fv-crosshair-v" />
      </div>
    </div>
  );
}

function AnnoVisual(): React.JSX.Element {
  return (
    <div className="fv-anno">
      <div className="fv-toolbar-big">
        {[
          { icon: '↖', label: '선택' },
          { icon: '□', label: '사각형', active: true },
          { icon: '○', label: '원' },
          { icon: '→', label: '화살표' },
          { icon: 'T', label: '텍스트' },
          { icon: '✏', label: '펜' },
          { icon: '◎', label: '컬러' },
          { icon: '▦', label: '모자이크' },
          { icon: '⬛', label: '블러' },
          { icon: '#', label: '번호' },
        ].map(({ icon, label, active }) => (
          <div key={label} className={`fv-tool${active ? ' fv-tool--active' : ''}`}>
            <span className="fv-tool-icon">{icon}</span>
            <span className="fv-tool-label">{label}</span>
          </div>
        ))}
      </div>
      <div className="fv-canvas-preview">
        <div className="fv-shape fv-shape-rect" />
        <div className="fv-shape fv-shape-circle" />
        <div className="fv-shape fv-shape-arrow">
          <svg viewBox="0 0 100 50" fill="none">
            <path d="M8 25 L72 25 M58 10 L74 25 L58 40" stroke="#ff3b30" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="fv-shape fv-shape-text">중요 버그</div>
        <div className="fv-shape fv-shape-num">3</div>
      </div>
    </div>
  );
}

function PinVisual(): React.JSX.Element {
  return (
    <div className="fv-pin">
      <div className="fv-bg-window">
        <div className="fv-bw-chrome">
          <span className="dot dot-red" /><span className="dot dot-yellow" /><span className="dot dot-green" />
        </div>
        <div className="fv-bw-body" />
      </div>
      <div className="fv-pinned-window">
        <div className="fv-pw-chrome">
          <span className="dot dot-red" /><span className="dot dot-yellow" /><span className="dot dot-green" />
          <span className="fv-pw-title">캡처 · 고정됨</span>
        </div>
        <div className="fv-pw-body">
          <div className="fv-pw-anno-rect" />
          <div className="fv-pw-text">수정 요청</div>
        </div>
      </div>
      <div className="fv-pin-badge">
        <span>📌</span> 항상 위에 표시
      </div>
    </div>
  );
}

function GifVisual(): React.JSX.Element {
  return (
    <div className="fv-gif">
      <div className="fv-gif-recorder">
        <div className="fv-gif-border">
          <div className="fv-gif-rec">
            <span className="fv-gif-dot" />
            REC
          </div>
          <div className="fv-gif-inner">
            <div className="fv-gif-frame" style={{ background: '#1a1a2e' }}>
              <div style={{ width: '60%', height: 6, background: '#5ea2ff55', borderRadius: 3, margin: '8px 0 4px' }} />
              <div style={{ width: '40%', height: 6, background: '#5ea2ff30', borderRadius: 3 }} />
            </div>
          </div>
          <div className="fv-gif-timer">00:03</div>
        </div>
      </div>
      <div className="fv-gif-frames">
        {[0.9, 0.6, 0.35].map((op, i) => (
          <div key={i} className="fv-gif-thumb" style={{ opacity: op }} />
        ))}
        <div className="fv-gif-output">.gif</div>
      </div>
    </div>
  );
}

function ColorVisual(): React.JSX.Element {
  const colors = [
    ['#ff3b30', '#ff6b6b', '#ff9f0a'],
    ['#30d158', '#5ea2ff', '#bf5af2'],
    ['#0d0d0f', '#3a3a3c', '#8e8e93'],
  ];
  return (
    <div className="fv-color">
      <div className="fv-magnifier">
        <div className="fv-mag-grid">
          {colors.flat().map((c, i) => (
            <div key={i} className="fv-mag-cell" style={{ background: c }} />
          ))}
        </div>
        <div className="fv-mag-cursor" />
      </div>
      <div className="fv-color-info">
        <div className="fv-color-swatch" style={{ background: '#5ea2ff' }} />
        <div className="fv-color-vals">
          <span className="fv-color-hex">#5EA2FF</span>
          <span className="fv-color-rgb">rgb(94, 162, 255)</span>
          <span className="fv-color-hsl">hsl(213, 100%, 68%)</span>
        </div>
        <button className="fv-color-copy">복사</button>
      </div>
    </div>
  );
}

function HistoryVisual(): React.JSX.Element {
  return (
    <div className="fv-history">
      <div className="fv-history-header">
        <span>캡처 히스토리</span>
        <span className="fv-history-count">6개</span>
      </div>
      <div className="fv-history-grid">
        {[
          { color: '#5ea2ff22', anno: true },
          { color: '#ff3b3022', anno: false },
          { color: '#30d15822', anno: true },
          { color: '#bf5af222', anno: false },
          { color: '#ff9f0a22', anno: true },
          { color: '#5ea2ff15', anno: false },
        ].map((item, i) => (
          <div key={i} className="fv-history-thumb" style={{ background: item.color }}>
            {item.anno && <div className="fv-history-anno" />}
          </div>
        ))}
      </div>
    </div>
  );
}

const FEATURES: Feature[] = [
  {
    num: '01',
    title: '글로벌 단축키',
    desc: '어느 앱에서든 즉시 캡처',
    detail: '어느 앱에서든 단축키 한 번으로 영역·전체화면·윈도우 캡처를 즉시 실행합니다. 앱을 전환할 필요가 없습니다.',
    visual: <CaptureVisual />,
  },
  {
    num: '02',
    title: '인라인 어노테이션',
    desc: '10가지 도구로 직접 설명',
    detail: '화살표·사각형·원·펜·텍스트·번호마커·지우개·하이라이트·블러·모자이크 10가지 도구로 캡처 위에 바로 그립니다.',
    visual: <AnnoVisual />,
  },
  {
    num: '03',
    title: 'Pin to Screen',
    desc: '캡처를 화면 위에 고정',
    detail: '어노테이션한 이미지를 항상 위에 띄워 참고 자료로 사용하면서 다른 작업을 계속할 수 있습니다.',
    visual: <PinVisual />,
  },
  {
    num: '04',
    title: 'GIF 녹화',
    desc: '영역을 선택해 바로 GIF로',
    detail: '영역을 선택해 시퀀스 GIF 또는 영상 GIF로 녹화하고 바로 저장합니다. 긴 설명 대신 GIF 하나로 전달하세요.',
    visual: <GifVisual />,
  },
  {
    num: '05',
    title: 'Color Picker',
    desc: '픽셀 단위 색상 추출',
    detail: '영역 선택 중 화면의 어떤 색이든 픽셀 단위로 확대·확인·복사할 수 있습니다. HEX·RGB·HSL 모두 지원합니다.',
    visual: <ColorVisual />,
  },
  {
    num: '06',
    title: '캡처 히스토리',
    desc: '세션 내 캡처 이력 관리',
    detail: '세션 중 복사하거나 핀한 캡처를 트레이 메뉴에서 바로 다시 불러올 수 있습니다.',
    visual: <HistoryVisual />,
  },
];

function FeatureItem({ feature, index }: { feature: Feature; index: number }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'start 0.25'] });
  const y = useTransform(scrollYProgress, [0, 1], [24, 0]);
  const visualY = useTransform(scrollYProgress, [0, 1], [32, 0]);
  const isEven = index % 2 === 0;

  return (
    <div ref={ref} className={`feature-item${isEven ? '' : ' feature-item--flip'}`}>
      <motion.div className="feature-text" style={{ y, opacity: scrollYProgress }}>
        <span className="feature-num">{feature.num}</span>
        <h3 className="feature-title">{feature.title}</h3>
        <p className="feature-desc-short">{feature.desc}</p>
        <p className="feature-detail">{feature.detail}</p>
      </motion.div>
      <motion.div className="feature-visual" style={{ y: visualY, opacity: scrollYProgress }}>
        {feature.visual}
      </motion.div>
    </div>
  );
}

export function Features(): React.JSX.Element {
  return (
    <section className="features" id="features">
      <motion.div
        className="features-header"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      >
        <span className="section-eyebrow">기능</span>
        <h2 className="section-title">ASIS로 할 수 있는 것들</h2>
        <p className="section-sub">캡처부터 공유까지, 한 번의 단축키로.</p>
      </motion.div>

      <div className="features-list">
        {FEATURES.map((f, i) => (
          <FeatureItem key={f.num} feature={f} index={i} />
        ))}
      </div>
    </section>
  );
}
