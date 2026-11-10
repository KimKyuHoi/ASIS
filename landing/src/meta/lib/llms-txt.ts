import { FAQ_ENTRIES } from '../../faq/lib/faq-data';
import { ANNOTATION_TOOLS, WORKFLOW_FEATURES } from '../../feature-detail/lib/feature-detail-data';
import { pageUrl } from '../../page/lib/page-path';
import { META_STRINGS } from './strings';

/**
 * llms.txt (https://llmstxt.org) — AI 답변 엔진이 HTML 을 해석하지 않고도 ASIS 를
 * 정확히 설명·인용하도록 핵심 사실을 마크다운으로 요약한다. 화면 문구와 같은 데이터에서 만든다.
 */
export function renderLlmsTxt(): string {
  const en = META_STRINGS.en.pages;
  const lines = [
    '# ASIS',
    '',
    `> ${en.home.description}`,
    '',
    '- Platform: macOS 13 Ventura or later, Apple Silicon (arm64) and Intel (x64)',
    '- Price: free; open source under the MIT license',
    '- Languages: English, Korean',
    '- Download: https://github.com/KimKyuHoi/ASIS/releases/latest',
    '- Source code: https://github.com/KimKyuHoi/ASIS',
    '',
    '## Pages',
    '',
    `- [Home](${pageUrl({ route: 'home', lang: 'en' })}): ${en.home.description}`,
    `- [Features](${pageUrl({ route: 'features', lang: 'en' })}): ${en.features.description}`,
    `- [FAQ](${pageUrl({ route: 'faq', lang: 'en' })}): ${en.faq.description}`,
    `- [Korean version](${pageUrl({ route: 'home', lang: 'ko' })}): ${META_STRINGS.ko.pages.home.description}`,
    '',
    '## Capture and recording features',
    '',
    ...WORKFLOW_FEATURES.en.map((f) => `- ${f.name} (${f.summary}): ${f.details.join(' ')}`),
    '',
    '## Annotation tools (single-key shortcuts in the editor)',
    '',
    ...ANNOTATION_TOOLS.en.map(
      (t) => `- ${t.name}${t.shortcut ? ` (${t.shortcut})` : ''}: ${t.summary}. ${t.details.join(' ')}`,
    ),
    '',
    '## FAQ',
    '',
    ...FAQ_ENTRIES.en.flatMap((e) => [`### ${e.q}`, '', e.a, '']),
  ];
  return lines.join('\n');
}
