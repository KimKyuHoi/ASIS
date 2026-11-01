import { defineDict } from '../../i18n/lib/define-dict';

type HeroStrings = {
  badge: string
  /** 애니메이션이 단어 단위로 쪼개므로 배열로 둔다. */
  titleLine1: string[]
  titleLine2: string[]
  subLine1: string
  subLine2: string
  /** 버전이 있으면 뒤에 ` (버전)` 이 붙는다. */
  downloadLabel: string
  githubLabel: string
  compat: string
  /** 데코용 목업 안의 어노테이션 라벨·창 제목·복사 버튼. */
  mockupLabel: string
  mockupTitle: string
  mockupCopy: string
};

export const HERO_STRINGS = defineDict<HeroStrings>({
  ko: {
    badge: '무료 · 오픈소스 · macOS 전용 · 한국어/English',
    titleLine1: ['보여주고', '싶은', '화면을,'],
    titleLine2: ['있는', '그대로.'],
    subLine1: '캡처·GIF·스텝 가이드를 찍고, 그 위에 바로 주석을 달아',
    subLine2: '클립보드로 복사하거나 공유하거나 화면에 핀으로 고정하세요.',
    downloadLabel: 'macOS 다운로드',
    githubLabel: 'GitHub에서 보기 →',
    compat: 'macOS 13 Ventura 이상 · Apple Silicon & Intel',
    mockupLabel: 'API 수정 필요',
    mockupTitle: 'ASIS — 주석',
    mockupCopy: '복사',
  },
  en: {
    badge: 'Free · Open source · macOS only · English/한국어',
    titleLine1: ['Show', 'your', 'screen'],
    titleLine2: ['as', 'it', 'is.'],
    subLine1: 'Capture screenshots, GIFs, and step guides, mark them up,',
    subLine2: 'then copy, share, or pin them on top of your screen.',
    downloadLabel: 'Download for macOS',
    githubLabel: 'View on GitHub →',
    compat: 'macOS 13 Ventura or later · Apple Silicon & Intel',
    mockupLabel: 'Fix the API',
    mockupTitle: 'ASIS — Annotate',
    mockupCopy: 'Copy',
  },
});
