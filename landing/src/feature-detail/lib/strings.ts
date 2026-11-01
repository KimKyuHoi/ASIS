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
    sub: '캡처부터 녹화, 주석, 공유까지 — 각 기능이 무엇을 하는지 자세히 살펴보세요.',
    annoTitle: '주석 도구',
    annoDesc: '캡처 위에 바로 그리는 12가지 도구. 한 글자 키로 전환하고, 키는 환경설정에서 바꾸거나 끌 수 있습니다.',
    workflowTitle: '캡처 · 녹화 · 공유',
    workflowDesc: '캡처를 시작하고 결과물을 활용하는 흐름 전체를 한 앱에서.',
    shortcutsTitle: '에디터 단축키',
    permsTitle: '필요 권한',
    permsDesc: '앱 최초 실행 시 아래 권한을 요청합니다.',
    cta: 'macOS 다운로드 →',
  },
  en: {
    eyebrow: 'Features',
    title: 'Everything ASIS can do',
    sub: 'From capture to recording, annotation, and sharing — a closer look at what each feature does.',
    annoTitle: 'Annotation Tools',
    annoDesc: 'Twelve tools for drawing right on your capture, each a single keystroke away — remap or turn off any key in Settings.',
    workflowTitle: 'Capture · Record · Share',
    workflowDesc: 'The whole flow — from starting a capture to putting the result to work — in one app.',
    shortcutsTitle: 'Editor Shortcuts',
    permsTitle: 'Required Permissions',
    permsDesc: 'ASIS asks for these permissions the first time it launches.',
    cta: 'Download for macOS →',
  },
});
