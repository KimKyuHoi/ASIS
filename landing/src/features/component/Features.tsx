import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { useLanguage } from '../../i18n/hook/useLanguage';
import { FEATURES_STRINGS } from '../lib/strings';

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

/** macOS 창 신호등 — 목업 공통. */
function TrafficLights(): React.JSX.Element {
  return (
    <span className="traffic">
      <span className="dot dot-red" />
      <span className="dot dot-yellow" />
      <span className="dot dot-green" />
    </span>
  );
}

/** 앱의 캡처 프레임 모티프(tokens.css --frame-*) — 얇은 선 + 모서리 꺾쇠. */
function FrameCorners(): React.JSX.Element {
  return (
    <>
      <span className="frame-corner frame-corner--tl" />
      <span className="frame-corner frame-corner--tr" />
      <span className="frame-corner frame-corner--bl" />
      <span className="frame-corner frame-corner--br" />
    </>
  );
}

function CaptureVisual(): React.JSX.Element {
  const lang = useLanguage();
  const v = FEATURES_STRINGS[lang].visuals;

  return (
    <div className="fv-capture">
      <div className="fv-displays">
        <div className="fv-screen">
          <div className="fv-screen-content">
            <span className="fv-line fv-line--w60" />
            <span className="fv-line fv-line--w80" />
            <span className="fv-line fv-line--w40" />
          </div>
          <div className="fv-selection">
            <FrameCorners />
            <div className="fv-size-badge">642 × 380</div>
          </div>
        </div>
        <div className="fv-screen fv-screen--second">
          <span className="fv-scope-badge">{v.captureScope}</span>
        </div>
      </div>
      <div className="fv-modes">
        {v.captureModes.map((mode, i) => (
          <span key={mode} className={`fv-mode${i === 0 ? ' fv-mode--active' : ''}`}>
            {mode}
          </span>
        ))}
      </div>
    </div>
  );
}

// 도구 아이콘은 데코 고정값. 순서는 앱 툴바(EDITOR_TOOLS)와 같고 라벨만 언어별로 바뀐다.
const ANNO_TOOL_ICONS = ['↖', '□', '○', '→', '╱', '✎', 'T', '①', '▬', '◌', '▦', '⌫'];
const ANNO_ACTIVE_INDEX = 3;

function AnnoVisual(): React.JSX.Element {
  const lang = useLanguage();
  const v = FEATURES_STRINGS[lang].visuals;

  return (
    <div className="fv-window">
      <div className="fv-window-bar">
        <TrafficLights />
      </div>
      <div className="fv-toolbar">
        {ANNO_TOOL_ICONS.map((icon, i) => (
          <span
            key={icon}
            className={`fv-tool${i === ANNO_ACTIVE_INDEX ? ' fv-tool--active' : ''}`}
            title={v.annoToolLabels[i]}
          >
            {icon}
          </span>
        ))}
      </div>
      <div className="fv-canvas">
        <div className="fv-shape-rect" />
        <div className="fv-shape-arrow">
          <svg viewBox="0 0 100 50" fill="none">
            <path d="M8 25 L72 25 M58 10 L74 25 L58 40" stroke="var(--anno-red)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="fv-shape-text">{v.annoShapeText}</div>
        <div className="fv-shape-num">1</div>
        <div className="fv-shape-mosaic" />
      </div>
      <div className="fv-tool-caption">{v.annoToolLabels[ANNO_ACTIVE_INDEX]}</div>
    </div>
  );
}

function RecordVisual(): React.JSX.Element {
  const lang = useLanguage();
  const v = FEATURES_STRINGS[lang].visuals;

  return (
    <div className="fv-record">
      <div className="fv-record-area">
        <FrameCorners />
        <span className="fv-line fv-line--w60" />
        <span className="fv-line fv-line--w40" />
        <svg className="fv-cursor" width="16" height="22" viewBox="0 0 16 22" aria-hidden="true">
          <path d="M1 1 L1 17 L5 13 L8 20 L11 19 L8 12 L14 12 Z" fill="var(--text)" stroke="var(--bg)" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="fv-hud">
        <span className="fv-rec-dot" />
        <span className="fv-hud-time">00:04</span>
        <span className="fv-hud-stop">{v.recordStop}</span>
      </div>
      <div className="fv-after">
        {v.recordAfter.map((label, i) => (
          <span key={label} className={`fv-after-opt${i === 2 ? ' fv-after-opt--active' : ''}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const STUDIO_FRAMES = 8;
const STUDIO_ACTIVE_FRAME = 3;

function StudioVisual(): React.JSX.Element {
  const lang = useLanguage();
  const v = FEATURES_STRINGS[lang].visuals;

  return (
    <div className="fv-window">
      <div className="fv-window-bar">
        <TrafficLights />
        <span className="fv-window-title">{v.studioTitle}</span>
      </div>
      <div className="fv-studio-stage">
        <div className="fv-studio-frame">
          <span className="fv-line fv-line--w60" />
          <span className="fv-line fv-line--w80" />
          <div className="fv-studio-anno" />
        </div>
        <span className="fv-studio-counter">{v.studioFrame}</span>
      </div>
      <div className="fv-filmstrip">
        <span className="fv-trim fv-trim--start" />
        {Array.from({ length: STUDIO_FRAMES }, (_, i) => (
          <span
            key={i}
            className={`fv-film${i === STUDIO_ACTIVE_FRAME ? ' fv-film--active' : ''}${i >= 2 && i <= 5 ? ' fv-film--annotated' : ''}`}
          />
        ))}
        <span className="fv-trim fv-trim--end" />
      </div>
      <div className="fv-studio-foot">
        <span className="fv-chip">{v.studioCopy}</span>
        <span className="fv-formats">.gif · .mov · .mp4</span>
      </div>
    </div>
  );
}

function ScrollVisual(): React.JSX.Element {
  const lang = useLanguage();
  const v = FEATURES_STRINGS[lang].visuals;

  return (
    <div className="fv-scroll">
      <div className="fv-scroll-view">
        <div className="fv-scroll-page">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className={`fv-line ${i % 3 === 0 ? 'fv-line--w80' : 'fv-line--w60'}`} />
          ))}
        </div>
        <div className="fv-scroll-frame">
          <FrameCorners />
        </div>
        <span className="fv-scroll-arrow">↓</span>
      </div>
      <div className="fv-scroll-result">
        <div className="fv-scroll-strip">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className={`fv-line ${i % 3 === 0 ? 'fv-line--w80' : 'fv-line--w60'}`} />
          ))}
        </div>
        <span className="fv-scroll-label">{v.scrollResult}</span>
      </div>
    </div>
  );
}

function GuideVisual(): React.JSX.Element {
  const lang = useLanguage();
  const v = FEATURES_STRINGS[lang].visuals;

  return (
    <div className="fv-window fv-guide">
      <div className="fv-window-bar">
        <TrafficLights />
        <span className="fv-window-title">{v.guideFile}</span>
      </div>
      <div className="fv-guide-body">
        <h4 className="fv-guide-title">{v.guideTitle}</h4>
        {v.guideSteps.map((step, i) => (
          <div key={step} className="fv-guide-step">
            <span className="fv-guide-num">{i + 1}</span>
            <span className="fv-guide-text">{step}</span>
            <span className="fv-guide-shot">
              <span className="fv-guide-click" style={{ left: `${30 + i * 18}%`, top: `${40 + (i % 2) * 18}%` }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PinVisual(): React.JSX.Element {
  const lang = useLanguage();
  const v = FEATURES_STRINGS[lang].visuals;

  return (
    <div className="fv-pin">
      <div className="fv-window fv-pin-bg">
        <div className="fv-window-bar">
          <TrafficLights />
        </div>
        <div className="fv-pin-bg-body">
          <span className="fv-line fv-line--w80" />
          <span className="fv-line fv-line--w60" />
          <span className="fv-line fv-line--w40" />
        </div>
      </div>
      <div className="fv-pinned">
        <div className="fv-pinned-bar">{v.pinWindowTitle}</div>
        <div className="fv-pinned-body">
          <div className="fv-pinned-rect" />
          <div className="fv-pinned-text">{v.pinText}</div>
        </div>
      </div>
      <div className="fv-pin-badges">
        <span className="fv-chip fv-chip--accent">📌 {v.pinBadge}</span>
        <span className="fv-chip">{v.pinClickThrough}</span>
      </div>
    </div>
  );
}

// 카드 텍스트와 순서가 1:1로 대응하는 시각 요소들.
const FEATURE_VISUALS = [
  CaptureVisual, AnnoVisual, RecordVisual, StudioVisual, ScrollVisual, GuideVisual, PinVisual,
];

// 도구 모음·개인화 카드 아이콘 — strings 의 items 순서와 1:1.
const TOOLBOX_ICONS = ['📏', '◎', '🕘', '📌', '✦'];
const PERSONAL_ICONS = ['◐', '⌨', '⌘', '文', '⧉', '⚙'];

type FeatureItemProps = {
  num: string
  title: string
  desc: string
  detail: string
  points: string[]
  Visual: () => React.JSX.Element
  index: number
};

function FeatureItem(
  { num, title, desc, detail, points, Visual, index }: FeatureItemProps,
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
        <ul className="feature-points">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </motion.div>
      <motion.div className="feature-visual" style={{ y: visualY, opacity: scrollYProgress }}>
        <Visual />
      </motion.div>
    </div>
  );
}

type CardGridProps = {
  eyebrow: string
  title: string
  sub: string
  items: { title: string; desc: string }[]
  icons: string[]
};

function CardGrid({ eyebrow, title, sub, items, icons }: CardGridProps): React.JSX.Element {
  return (
    <div className="card-group">
      <motion.div
        className="features-header"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <span className="section-eyebrow">{eyebrow}</span>
        <h2 className="section-title section-title--sm">{title}</h2>
        <p className="section-sub">{sub}</p>
      </motion.div>
      <div className="card-grid">
        {items.map((item, i) => (
          <motion.article
            key={item.title}
            className="mini-card"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: Math.min(i * 0.05, 0.25), ease: EASE }}
          >
            <span className="mini-card-icon" aria-hidden="true">{icons[i]}</span>
            <h3 className="mini-card-title">{item.title}</h3>
            <p className="mini-card-desc">{item.desc}</p>
          </motion.article>
        ))}
      </div>
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
        transition={{ duration: 0.6, ease: EASE }}
      >
        <span className="section-eyebrow">{t.eyebrow}</span>
        <h2 className="section-title">{t.title}</h2>
        <p className="section-sub">{t.sub}</p>
      </motion.div>

      <div className="features-list">
        {t.items.map((item, i) => (
          <FeatureItem
            key={item.title}
            num={String(i + 1).padStart(2, '0')}
            title={item.title}
            desc={item.desc}
            detail={item.detail}
            points={item.points}
            Visual={FEATURE_VISUALS[i]}
            index={i}
          />
        ))}
      </div>

      <CardGrid {...t.toolbox} icons={TOOLBOX_ICONS} />
      <CardGrid {...t.personal} icons={PERSONAL_ICONS} />

      <div className="soon">
        <span className="soon-label">{t.soon.label}</span>
        {t.soon.items.map((name) => (
          <span key={name} className="soon-chip">{name}</span>
        ))}
      </div>
    </section>
  );
}
