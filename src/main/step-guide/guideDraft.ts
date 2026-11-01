import type { GuideDraft, GuideDraftStep, GuideEdits } from '../../shared/step-guide';
import { tGuide } from './guideCopy';
import { defaultTitle, stepCaption, type Guide } from './stepGuideExport';

/**
 * 녹화 결과(Guide) ↔ 편집 창 초안(GuideDraft) 변환 — 순수 함수.
 *
 * null-safety.md — 편집 창이 보낸 id 가 초안에 없으면(중복·위조·버그) 조용히 건너뛰지 않고 throw.
 */

/** 녹화 결과 → 편집 창 초안. 기본 제목·문장을 채우고 단계마다 안정 id 를 붙인다. */
export function toDraft(guide: Guide): GuideDraft {
  return {
    title: defaultTitle(guide),
    description: '',
    createdAt: guide.createdAt,
    steps: guide.steps.map((s, i) => ({
      id: `step-${i + 1}`,
      kind: s.kind,
      imageDataUrl: s.imageDataUrl,
      width: s.width,
      height: s.height,
      clickX: s.clickX,
      clickY: s.clickY,
      target: s.target ?? null,
      appName: s.appName ?? null,
      caption: stepCaption(s),
      note: '',
    })),
  };
}

/** 편집 결과를 초안에 적용 — edits.steps 순서가 최종 순서, 빠진 단계는 삭제. */
export function applyEdits(draft: GuideDraft, edits: GuideEdits): GuideDraft {
  const byId = new Map(draft.steps.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const steps = edits.steps.map((e) => {
    const base = byId.get(e.id);
    if (!base) throw new Error(`applyEdits: 초안에 없는 단계 id — ${e.id}`);
    if (seen.has(e.id)) throw new Error(`applyEdits: 중복된 단계 id — ${e.id}`);
    seen.add(e.id);
    return {
      ...base,
      caption: e.caption.trim(),
      note: e.note.trim(),
      imageDataUrl: annotatedImage(base, e.annotatedImageDataUrl),
    };
  });
  return {
    ...draft,
    title: edits.title.trim(),
    description: edits.description.trim(),
    steps,
  };
}

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

/**
 * 단계의 최종 이미지 — 편집 창에서 주석을 합성했으면 그 PNG, 아니면 원본.
 * 합성본은 원본 위에 주석만 얹은 같은 크기라 클릭 표시 좌표(이미지 픽셀)는 그대로 맞는다.
 * GIF 단계는 주석 대상이 아니므로 합성본이 오면 버그로 본다.
 */
function annotatedImage(base: GuideDraftStep, annotated: string | null): string {
  // null = 이 단계엔 주석이 없다(실제 옵셔널) — 원본 그대로.
  if (annotated === null) return base.imageDataUrl;
  if (base.kind !== 'image') throw new Error(`applyEdits: GIF 단계에 주석 이미지 — ${base.id}`);
  if (!annotated.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error(`applyEdits: 주석 이미지가 PNG data URL 이 아님 — ${base.id}`);
  }
  return annotated;
}

/** 저장 기본 파일명 — 제목에서 파일 시스템 금지 문자를 걷어 낸다. 비면 기본 이름. */
export function guideFileName(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${safe || tGuide().fileFallback}.html`;
}
