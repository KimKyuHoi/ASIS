import { defineDict } from '../../i18n/lib/define-dict';

type FeatureDetailStrings = {
  eyebrow: string
  title: string
  sub: string
  annoTitle: string
  annoDesc: string
  workflowTitle: string
  workflowDesc: string
  shortcutsTitle: string
  permsTitle: string
  permsDesc: string
  cta: string
};

export const FEATURE_DETAIL_STRINGS = defineDict<FeatureDetailStrings>({
  ko: {
    eyebrow: '기능 상세',
    title: 'ASIS가 할 수 있는 모든 것',
    sub: '캡처부터 어노테이션, 공유까지 — 각 도구가 무엇을 하는지 자세히 살펴보세요.',
    annoTitle: '어노테이션 도구',
    annoDesc: '캡처 위에 바로 그리는 8가지 도구. 모두 단축키로 즉시 전환됩니다.',
    workflowTitle: '캡처 & 워크플로우',
    workflowDesc: '캡처를 시작하고 결과물을 활용하는 흐름 전체를 한 앱에서.',
    shortcutsTitle: '단축키',
    permsTitle: '필요 권한',
    permsDesc: '앱 최초 실행 시 아래 권한을 요청합니다.',
    cta: 'macOS 다운로드 →',
  },
  en: {
    eyebrow: 'Features',
    title: 'Everything ASIS can do',
    sub: 'From capture to annotation to sharing — a closer look at what each tool does.',
    annoTitle: 'Annotation Tools',
    annoDesc: 'Eight tools for drawing right on your capture, all a keystroke away.',
    workflowTitle: 'Capture & Workflow',
    workflowDesc: 'The whole flow — from starting a capture to putting the result to work — in one app.',
    shortcutsTitle: 'Shortcuts',
    permsTitle: 'Required Permissions',
    permsDesc: 'ASIS asks for these permissions the first time it launches.',
    cta: 'Download for macOS →',
  },
});
