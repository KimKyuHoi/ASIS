import { getLanguage } from '../../shared/i18n/language';
import type { GuideDraft, GuideDraftStep } from '../../shared/step-guide';
import { tGuide } from './guideCopy';
import { GUIDE_RUNTIME_JS } from './guideRuntime';
import { GUIDE_CSS } from './guideTheme';

/**
 * 스텝바이스텝 가이드 문서 생성 — 순수 문자열 생성(부수효과 없음).
 *
 * imperative-style.md — 순수 유틸/포맷팅 함수는 명령형 OK.
 * null-safety.md — 빈 스텝 배열 등 경계는 명시 처리.
 *
 * 흐름: 녹화 결과(Guide) → guideDraft.toDraft → ASIS 편집 창에서 수정 → applyEdits →
 * toHtml 로 *단일 HTML* 하나를 쓴다.
 *   - 이미지는 data URL 로 임베드 → 메신저로 파일 하나만 보내면 오프라인에서 열린다.
 *   - 본문은 정적 HTML 이라 스크립트 없이도(미리보기·인쇄) 그대로 읽힌다.
 *   - 인라인 런타임(guideRuntime)이 [편집]/[저장]을 붙여, 받은 사람도 브라우저에서
 *     문구를 고치고 다시 저장할 수 있다.
 */

/**
 * 스텝 이미지의 종류.
 *   - 'image': 전역 클릭 시점의 정지 PNG (이미지 모드의 각 클릭).
 *   - 'gif'  : [GIF 시작]~[GIF 정지] 구간 전체를 담은 하나의 연속 애니메이션 GIF.
 * gif 는 애니메이션이라 클릭 마커를 얹지 않는다.
 */
export type StepKind =
  | 'image' |
  'gif';

/** 클릭한 UI 요소의 영역 — 이미지 픽셀 기준. */
export type StepTarget = { x: number; y: number; w: number; h: number };

/** 가이드의 스텝 하나. 좌표는 캡처 이미지의 픽셀 기준(포인터 표시용). */
export type GuideStep = {
  kind: StepKind;
  /** 이 스텝 이미지의 data URL. image=PNG, gif=GIF base64. */
  imageDataUrl: string;
  /** 이미지 픽셀 크기. */
  width: number;
  height: number;
  /** 클릭 위치 — 이미지 좌상단 기준 픽셀 좌표. gif 는 마커 미표시라 무시된다. */
  clickX: number;
  clickY: number;
  /** 클릭한 UI 요소 영역. AX 조회 실패·요소가 너무 큼(창 전체 등)이면 undefined → 점 마커만. */
  target?: StepTarget;
  /** 클릭 지점의 UI 요소 이름(AX). 없으면 undefined. */
  label?: string;
  /** 클릭한 창의 앱 이름. 모르면 undefined → 칩 생략. */
  appName?: string;
};

/** 완성된 가이드. */
export type Guide = {
  createdAt: number;
  steps: GuideStep[];
};

function formatDate(ms: number): string {
  // 로케일 무관 안정 포맷 — YYYY-MM-DD HH:mm.
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** 단계 기본 문장 — 사용자가 편집 창에서 고치는 출발점. */
export function stepCaption(step: GuideStep): string {
  const t = tGuide();
  if (step.kind === 'gif') return t.captionGif;
  if (step.label) return t.captionLabel(step.label);
  return t.captionPoint;
}

/** 기본 제목 — 모든 이미지 스텝이 같은 앱이면 그 앱 이름을 넣는다. */
export function defaultTitle(guide: Guide): string {
  const apps = new Set<string>();
  for (const s of guide.steps) {
    if (s.appName) apps.add(s.appName);
  }
  const only = apps.size === 1 ? [...apps][0] : null;
  return tGuide().defaultTitle(only);
}

/** HTML/속성에 넣기 전 텍스트 이스케이프 — XSS/깨짐 방지. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** <script type="application/json"> 안에 넣을 JSON — "</script>" 조기 종료 방지. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** 문서 HTML 생성 — 편집 창에서 확정된 초안을 받는다. 항상 보기 모드로 열린다. */
export function toHtml(doc: GuideDraft): string {
  const t = tGuide();
  const stepsHtml = doc.steps.map((s, i) => renderStepHtml(s, i + 1)).join('\n');
  // 런타임이 쓰는 UI 문구만 골라 넘긴다(함수 값은 JSON 으로 못 넘김).
  const runtimeUi = {
    countTemplate: t.countTemplate,
    removeConfirm: t.removeConfirm,
    fileFallback: t.fileFallback,
  };

  return `<!doctype html>
<html lang="${getLanguage()}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="ASIS" />
<title>${escapeHtml(doc.title || t.fileFallback)}</title>
<style>${GUIDE_CSS}</style>
</head>
<body data-mode="view">
<div class="bar">
  <span class="bar__hint">${escapeHtml(t.editingHint)}</span>
  <button type="button" class="btn" data-action="edit" title="${escapeHtml(t.editTitle)}">${escapeHtml(t.edit)}</button>
  <button type="button" class="btn" data-action="view" title="${escapeHtml(t.doneTitle)}">${escapeHtml(t.done)}</button>
  <button type="button" class="btn btn--primary" data-action="save" title="${escapeHtml(t.saveTitle)}">${escapeHtml(t.save)}</button>
</div>
<main class="doc">
  <header>
    <p class="eyebrow">${escapeHtml(t.eyebrow)} · <span data-count>${escapeHtml(t.countTemplate.replace('{n}', String(doc.steps.length)))}</span></p>
    <h1 class="title" data-field="title" data-single-line data-placeholder="${escapeHtml(t.titlePlaceholder)}">${escapeHtml(doc.title)}</h1>
    <p class="desc" data-field="description" data-placeholder="${escapeHtml(t.descriptionPlaceholder)}">${escapeHtml(doc.description)}</p>
    <p class="meta">${escapeHtml(t.createdAt(formatDate(doc.createdAt)))}</p>
  </header>
  <ol class="steps">
${stepsHtml}
  </ol>
  <p class="footer">${escapeHtml(t.footer)}</p>
</main>
<script type="application/json" id="asis-guide-ui">${jsonForScript(runtimeUi)}</script>
<script>${GUIDE_RUNTIME_JS}</script>
</body>
</html>
`;
}

function renderStepHtml(step: GuideDraftStep, order: number): string {
  const t = tGuide();
  const alt = escapeHtml(t.stepAlt(order));
  const app = step.appName ? `<span class="step__app">${escapeHtml(step.appName)}</span>` : '';

  // 클릭 위치 표시(빨간 동그라미)는 편집 창에서 기본 주석으로 들어가 이미지에 합성돼 온다 —
  // 사용자가 옮기거나 지울 수 있게 하려고 문서에서 따로 그리지 않는다.
  return `    <li class="step" data-kind="${step.kind}">
      <div class="step__head">
        <span class="step__num" aria-hidden="true"></span>
        <div class="step__body">
          ${app}
          <h2 class="step__caption" data-field="caption" data-single-line data-placeholder="${escapeHtml(t.captionPlaceholder)}">${escapeHtml(step.caption)}</h2>
          <p class="step__note" data-field="note" data-placeholder="${escapeHtml(t.notePlaceholder)}">${escapeHtml(step.note)}</p>
        </div>
        <div class="step__tools">
          <button type="button" class="tool" data-action="up" title="${escapeHtml(t.moveUp)}">↑</button>
          <button type="button" class="tool" data-action="down" title="${escapeHtml(t.moveDown)}">↓</button>
          <button type="button" class="tool tool--danger" data-action="remove">${escapeHtml(t.remove)}</button>
        </div>
      </div>
      <figure class="shot">
        <img src="${step.imageDataUrl}" alt="${alt}" width="${step.width}" height="${step.height}" />
      </figure>
    </li>`;
}
