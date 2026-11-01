import type { Decorator, Preview } from '@storybook/react-vite';
import '../src/renderer/design-system/asset/base.css';
import './preview.css';
import {
  SYSTEM_ACCENTS,
  accentOverrides,
  type SystemAccentName,
} from '../src/renderer/design-system/lib/accent';

type AppearanceGlobal = 'system' | 'light' | 'dark' | 'split';

type AccentName = 'brand' | SystemAccentName;

const ACCENT_TITLES: Record<AccentName, string> = {
  brand: 'ASIS 오렌지 (기본)',
  blue: '파랑',
  purple: '보라',
  pink: '분홍',
  red: '빨강',
  yellow: '노랑',
  green: '초록',
  graphite: '그래파이트',
};

const isAccentName = (value: unknown): value is AccentName =>
  typeof value === 'string' && value in ACCENT_TITLES;

/** 덮어쓴 강조색 토큰 목록 — 'brand' 로 돌아올 때 지운다. */
const OVERRIDE_KEYS = Object.keys(accentOverrides(SYSTEM_ACCENTS.blue));

/**
 * 툴바 globals → <html> 속성. 앱과 똑같이 data-appearance·data-contrast·--accent 로 외형을 바꾼다.
 * 'split' 은 html 은 시스템에 두고 라이트/다크 두 판을 나란히 그린다.
 */
const applyGlobals = (appearance: AppearanceGlobal, accent: AccentName, contrast: string): void => {
  const root = document.documentElement;
  if (appearance === 'light' || appearance === 'dark') root.dataset.appearance = appearance;
  else delete root.dataset.appearance;
  if (contrast === 'more') root.dataset.contrast = 'more';
  else delete root.dataset.contrast;
  for (const key of OVERRIDE_KEYS) root.style.removeProperty(key);
  if (accent === 'brand') return;
  for (const [key, value] of Object.entries(accentOverrides(SYSTEM_ACCENTS[accent]))) {
    root.style.setProperty(key, value);
  }
};

const withAppearance: Decorator = (Story, context) => {
  const appearance = context.globals.appearance as AppearanceGlobal;
  const accentGlobal: unknown = context.globals.accent;
  const accent = isAccentName(accentGlobal) ? accentGlobal : 'brand';
  const contrast = String(context.globals.contrast);
  applyGlobals(appearance, accent, contrast);
  // 전역이 바뀌면 다시 마운트 — 대비 측정 블록이 새 외형으로 다시 잰다.
  const key = `${appearance}-${accent}-${contrast}`;
  if (appearance !== 'split') {
    return (
      <div key={key} className="sb-root">
        <Story />
      </div>
    );
  }
  return (
    <div key={key} className="sb-split">
      <div className="sb-root" data-appearance="light">
        <p className="sb-pane-label">라이트 (aqua)</p>
        <Story />
      </div>
      <div className="sb-root" data-appearance="dark">
        <p className="sb-pane-label">다크 (darkAqua)</p>
        <Story />
      </div>
    </div>
  );
};

const preview: Preview = {
  decorators: [withAppearance],
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
    a11y: { test: 'todo' },
    options: {
      storySort: { order: ['Introduction', 'Foundations', 'Components', 'Guides'] },
    },
  },
  globalTypes: {
    appearance: {
      description: '외형 (data-appearance)',
      toolbar: {
        title: '외형',
        icon: 'mirror',
        dynamicTitle: true,
        items: [
          { value: 'split', title: '라이트 + 다크' },
          { value: 'system', title: '시스템' },
          { value: 'light', title: '라이트' },
          { value: 'dark', title: '다크' },
        ],
      },
    },
    accent: {
      description: '강조색 — 기본은 ASIS 오렌지, 나머지는 macOS 강조색 비교용',
      toolbar: {
        title: '강조색',
        icon: 'paintbrush',
        dynamicTitle: true,
        items: (Object.keys(ACCENT_TITLES) as AccentName[]).map((name) => ({
          value: name,
          title: ACCENT_TITLES[name],
        })),
      },
    },
    contrast: {
      description: '대비 증가 (data-contrast / prefers-contrast)',
      toolbar: {
        title: '대비',
        icon: 'contrast',
        dynamicTitle: true,
        items: [
          { value: 'standard', title: '표준 대비' },
          { value: 'more', title: '대비 증가' },
        ],
      },
    },
  },
  initialGlobals: { appearance: 'split', accent: 'brand', contrast: 'standard' },
};

export default preview;
