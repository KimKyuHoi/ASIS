import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { useLanguage } from '../../i18n/hook/useLanguage';
import { FEATURES_STRINGS } from '../lib/strings';

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

// 어노테이션 도구 아이콘·활성 상태는 데코 고정값. 라벨만 언어별로 바뀐다.
const ANNO_TOOL_ICONS = ['↖', '□', '○', '→', 'T', '✏', '◎', '▦', '⬛', '#'];
const ANNO_ACTIVE_INDEX = 1;

function AnnoVisual(): React.JSX.Element {
  const lang = useLanguage();
  const v = FEATURES_STRINGS[lang].visuals;

  return (
    <div className="fv-anno">
      <div className="fv-toolbar-big">
        {ANNO_TOOL_ICONS.map((icon, i) => (
          <div key={i} className={`fv-tool${i === ANNO_ACTIVE_INDEX ? ' fv-tool--active' : ''}`}>
            <span className="fv-tool-icon">{icon}</span>
            <span className="fv-tool-label">{v.annoToolLabels[i]}</span>
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
        <div className="fv-shape fv-shape-text">{v.annoShapeText}</div>
        <div className="fv-shape fv-shape-num">3</div>
      </div>
    </div>
  );
}

function PinVisual(): React.JSX.Element {
  const lang = useLanguage();
  const v = FEATURES_STRINGS[lang].visuals;

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
          <span className="fv-pw-title">{v.pinWindowTitle}</span>
        </div>
        <div className="fv-pw-body">
          <div className="fv-pw-anno-rect" />
          <div className="fv-pw-text">{v.pinText}</div>
        </div>
      </div>
      <div className="fv-pin-badge">
        <span>📌</span> {v.pinBadge}
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
  const lang = useLanguage();
  const v = FEATURES_STRINGS[lang].visuals;
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
        <button className="fv-color-copy">{v.colorCopy}</button>
      </div>
    </div>
  );
}

function HistoryVisual(): React.JSX.Element {
  const lang = useLanguage();
  const v = FEATURES_STRINGS[lang].visuals;

  return (
    <div className="fv-history">
      <div className="fv-history-header">
        <span>{v.historyHeader}</span>
        <span className="fv-history-count">{v.historyCount}</span>
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

// 카드 텍스트와 순서가 1:1로 대응하는 시각 요소들.
const FEATURE_VISUALS = [
  CaptureVisual, AnnoVisual, PinVisual, GifVisual, ColorVisual, HistoryVisual,
];

type FeatureItemProps = {
  num: string
  title: string
  desc: string
  detail: string
  Visual: () => React.JSX.Element
  index: number
};

function FeatureItem(
  { num, title, desc, detail, Visual, index }: FeatureItemProps,
): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'start 0.25'] });
  const y = useTransform(scrollYProgress, [0, 1], [24, 0]);
  const visualY = useTransform(scrollYProgress, [0, 1], [32, 0]);
  const isEven = index % 2 === 0;

  return (
    <div ref={ref} className={`feature-item${isEven ? '' : ' feature-item--flip'}`}>
      <motion.div className="feature-text" style={{ y, opacity: scrollYProgress }}>
        <span className="feature-num">{num}</span>
        <h3 className="feature-title">{title}</h3>
        <p className="feature-desc-short">{desc}</p>
        <p className="feature-detail">{detail}</p>
      </motion.div>
      <motion.div className="feature-visual" style={{ y: visualY, opacity: scrollYProgress }}>
        <Visual />
      </motion.div>
    </div>
  );
}

export function Features(): React.JSX.Element {
  const lang = useLanguage();
  const t = FEATURES_STRINGS[lang];

  return (
    <section className="features" id="features">
      <motion.div
        className="features-header"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      >
        <span className="section-eyebrow">{t.eyebrow}</span>
        <h2 className="section-title">{t.title}</h2>
        <p className="section-sub">{t.sub}</p>
      </motion.div>

      <div className="features-list">
        {t.items.map((item, i) => (
          <FeatureItem
            key={i}
            num={String(i + 1).padStart(2, '0')}
            title={item.title}
            desc={item.desc}
            detail={item.detail}
            Visual={FEATURE_VISUALS[i]}
            index={i}
          />
        ))}
      </div>
    </section>
  );
}
