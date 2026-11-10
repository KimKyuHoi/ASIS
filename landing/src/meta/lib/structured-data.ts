import { FAQ_ENTRIES } from '../../faq/lib/faq-data';
import { WORKFLOW_FEATURES } from '../../feature-detail/lib/feature-detail-data';
import { pageUrl, SITE_ORIGIN } from '../../page/lib/page-path';
import type { Language } from '../../i18n/lib/language';
import type { Page } from '../../page/types/page';
import { META_STRINGS } from './strings';

/**
 * 공유 카드·구조화 데이터용 대표 이미지 — 언어별 홈 히어로 캡처(public/og-image*.png, 1200×630).
 * 히어로 문구를 바꾸면 다시 찍는다.
 */
const OG_IMAGE_FILE: Record<Language, string> = { en: 'og-image.png', ko: 'og-image-ko.png' };

export function ogImageUrl(lang: Language): string {
  return pageUrl({ route: 'home', lang: 'en' }) + OG_IMAGE_FILE[lang];
}

const REPO_URL = 'https://github.com/KimKyuHoi/ASIS';

/**
 * schema.org JSON-LD. 검색엔진·AI 답변 엔진이 "무엇을 하는 앱인지 / 무료인지 / 어디서 받는지"를
 * 마크업 해석 없이 읽어 가게 한다. 평점·리뷰처럼 실제 근거가 없는 필드는 넣지 않는다.
 */
function softwareApplication(page: Page): object {
  const meta = META_STRINGS[page.lang].pages.home;
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'ASIS',
    url: pageUrl({ route: 'home', lang: page.lang }),
    description: meta.description,
    inLanguage: page.lang,
    applicationCategory: 'MultimediaApplication',
    applicationSubCategory: 'Screenshot and screen recording',
    operatingSystem: 'macOS 13 Ventura or later',
    processorRequirements: 'Apple Silicon (arm64) or Intel (x64)',
    isAccessibleForFree: true,
    license: 'https://opensource.org/licenses/MIT',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    downloadUrl: `${REPO_URL}/releases/latest`,
    image: ogImageUrl(page.lang),
    screenshot: ogImageUrl(page.lang),
    featureList: WORKFLOW_FEATURES[page.lang].map((f) => `${f.name} — ${f.summary}`),
    author: { '@type': 'Person', name: 'KimKyuHoi', url: `${SITE_ORIGIN}/` },
    sameAs: [REPO_URL],
  };
}

function faqPage(page: Page): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: page.lang,
    mainEntity: FAQ_ENTRIES[page.lang].map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}

export function structuredData(page: Page): object[] {
  if (page.route === 'home' || page.route === 'features') return [softwareApplication(page)];
  if (page.route === 'faq') return [faqPage(page)];
  return [];
}
