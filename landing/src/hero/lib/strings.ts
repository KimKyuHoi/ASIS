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
  /** 데코용 목업 안의 어노테이션 라벨. */
  mockupLabel: string
};

export const HERO_STRINGS = defineDict<HeroStrings>({
  ko: {
    badge: '무료 · 오픈소스 · macOS 전용',
    titleLine1: ['스크린샷을'],
    titleLine2: ['더', '빠르게.'],
    subLine1: '캡처하고, 그 위에 바로 화살표·도형·텍스트를 그리고,',
    subLine2: '클립보드로 복사하거나 화면에 핀으로 고정하세요.',
    downloadLabel: 'macOS 다운로드',
    githubLabel: 'GitHub에서 보기 →',
    compat: 'macOS 13 Ventura 이상 · Apple Silicon & Intel',
    mockupLabel: 'API 수정 필요',
  },
  en: {
    badge: 'Free · Open source · macOS only',
    titleLine1: ['Screenshots,'],
    titleLine2: ['done', 'faster.'],
    subLine1: 'Capture, then draw arrows, shapes, and text right on top —',
    subLine2: 'copy it to your clipboard or pin it on top of your screen.',
    downloadLabel: 'Download for macOS',
    githubLabel: 'View on GitHub →',
    compat: 'macOS 13 Ventura or later · Apple Silicon & Intel',
    mockupLabel: 'Fix the API',
  },
});
