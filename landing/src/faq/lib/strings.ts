import { defineDict } from '../../i18n/lib/define-dict';

type FaqStrings = {
  eyebrow: string
  title: string
  sub: string
  faqSubtitle: string
  contactSubtitle: string
  contactDesc: string
};

export const FAQ_STRINGS = defineDict<FaqStrings>({
  ko: {
    eyebrow: 'FAQ · 문의',
    title: '자주 묻는 질문 & 문의',
    sub: '먼저 아래 FAQ를 확인하고, 원하는 기능이나 수정 요청은 댓글로 남겨주세요.',
    faqSubtitle: '자주 묻는 질문',
    contactSubtitle: '기능 · 수정 문의',
    contactDesc:
      '원하는 기능이나 고쳐졌으면 하는 점을 남겨주세요. GitHub 계정으로 로그인해 질문·답변을 주고받을 수 있습니다.',
  },
  en: {
    eyebrow: 'FAQ · Contact',
    title: 'FAQ & Contact',
    sub: 'Check the FAQ below first, then drop any feature requests or fixes in the comments.',
    faqSubtitle: 'Frequently Asked Questions',
    contactSubtitle: 'Feature & Fix Requests',
    contactDesc:
      "Tell us which features you'd like or what you'd like fixed. Sign in with your GitHub account to ask and follow up.",
  },
});
