import { basename } from 'node:path';
import { getLanguage } from '../../shared/i18n/language';
import { tMain } from '../i18n/strings';

/**
 * 스텝바이스텝 가이드 문서 생성 — 순수 문자열 생성(부수효과 없음).
 *
 * imperative-style.md — 순수 유틸/포맷팅 함수는 명령형 OK.
 * null-safety.md — 빈 스텝 배열 등 경계는 명시 처리.
 *
 * 두 가지 export 형식:
 *   - Markdown: 이미지를 상대 경로로 참조(파일이 같은 폴더에 함께 저장되는 전제).
 *   - HTML: 이미지를 data URL 로 임베드해 단일 .html 파일로 자체 완결(공유 편함).
 */

/**
 * 스텝 이미지의 종류.
 *   - 'image': 전역 클릭 시점의 정지 PNG (이미지 모드의 각 클릭).
 *   - 'gif'  : [GIF 시작]~[GIF 정지] 구간 전체를 담은 하나의 연속 애니메이션 GIF.
 * kind 에 따라 파일 확장자·마커 표시 여부가 갈린다(gif 는 애니메이션이라 마커 없음).
 */
export type StepKind =
  | 'image' |
  'gif';

/** 가이드의 스텝 하나. 좌표는 캡처 이미지의 픽셀 기준(포인터 표시용). */
export type GuideStep = {
  /** 1-based 순번. */
  order: number;
  /** 이미지 종류 — 파일 확장자(png/gif)·포인터 마커 표시 여부를 가른다. */
  kind: StepKind;
  /** 캡처 결과 파일(PNG 또는 GIF)의 절대 경로. */
  imagePath: string;
  /** 이 스텝 이미지의 data URL(HTML 임베드용). image=PNG, gif=GIF base64. */
  imageDataUrl: string;
  /** 이미지 픽셀 크기. */
  width: number;
  height: number;
  /** 클릭 위치 — 이미지 좌상단 기준 픽셀 좌표(포인터 마커 위치). gif 는 마커 미표시. */
  clickX: number;
  clickY: number;
  /** 스텝 시각(epoch ms). */
  timestamp: number;
  /** 클릭 지점의 UI 요소 이름(AX). 없으면 undefined. */
  label?: string;
};

/** 완성된 가이드. */
export type Guide = {
  title: string;
  createdAt: number;
  steps: GuideStep[];
};

/** 포인터 마커 반지름(px, 이미지 픽셀 기준). */
const MARKER_RADIUS = 22;

function formatDate(ms: number): string {
  // 로케일 무관 안정 포맷 — YYYY-MM-DD HH:mm:ss.
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * 한 스텝의 사람용 설명 텍스트.
 *   - gif: 연속 녹화 구간이라 단일 클릭 좌표가 없다 → "N. 화면 동작 (GIF)".
 *   - image + 라벨: "N. '버튼' 클릭".
 *   - image + 라벨 없음: "N. (x, y) 위치 클릭".
 */
function stepCaption(step: GuideStep): string {
  const t = tMain().stepGuideDoc;
  if (step.kind === 'gif') {
    return t.captionGif(step.order);
  }
  if (step.label) {
    return t.captionLabel(step.order, step.label);
  }
  return t.captionPoint(step.order, step.clickX, step.clickY);
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
/**
 * Markdown 문서 생성 — 이미지는 상대 경로 참조.
 * imageFileNames: 각 스텝 이미지가 저장될 파일명(순번과 동일 인덱스). 문서와 같은
 * 폴더에 저장되는 전제. 길이가 steps 와 다르면 throw(호출자 실수 조기 발견).
 */
export function toMarkdown(guide: Guide, imageFileNames: string[]): string {
  if (imageFileNames.length !== guide.steps.length) {
    throw new Error(
      `toMarkdown: imageFileNames(${imageFileNames.length}) 와 steps(${guide.steps.length}) 길이 불일치`,
    );
  }

  const t = tMain().stepGuideDoc;
  const lines: string[] = [];
  lines.push(`# ${guide.title}`);
  lines.push('');
  lines.push(`_${t.metaLine(formatDate(guide.createdAt), guide.steps.length)}_`);
  lines.push('');

  if (guide.steps.length === 0) {
    lines.push(`_${t.empty}_`);
    lines.push('');
    return lines.join('\n');
  }

  for (let i = 0; i < guide.steps.length; i++) {
    const step = guide.steps[i];
    const fileName = imageFileNames[i];
    lines.push(`## ${stepCaption(step)}`);
    lines.push('');
    // alt 텍스트에 순번 — 스크린리더/이미지 로드 실패 대비.
    lines.push(`![${t.stepAlt(step.order)}](./${fileName})`);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
/** HTML/속성에 넣기 전 텍스트 이스케이프 — XSS/깨짐 방지. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * HTML 문서 생성 — 이미지는 data URL 임베드(단일 파일 자체 완결).
 * 각 스텝 이미지 위에 클릭 위치 포인터 마커를 CSS 로 오버레이한다.
 * 마커 위치는 이미지 표시 크기에 맞춰 퍼센트로 배치(반응형).
 */
export function toHtml(guide: Guide): string {
  const t = tMain().stepGuideDoc;
  const stepsHtml = guide.steps.length === 0
    ? `<p class="empty">${escapeHtml(t.empty)}</p>`
    : guide.steps.map(renderStepHtml).join('\n');

  // 인라인 CSS — asis-ocr/에디터처럼 자체 완결 산출물이라 외부 의존 없음.
  return `<!doctype html>
<html lang="${getLanguage()}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(guide.title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.6; max-width: 900px; margin-inline: auto;
    color: #1a1a1a; background: #fafafa;
  }
  h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
  .meta { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
  .step { margin-bottom: 3rem; }
  .step h2 { font-size: 1.15rem; margin-bottom: 0.75rem; }
  .shot { position: relative; display: inline-block; max-width: 100%; }
  .shot img { display: block; max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 6px; }
  .marker {
    position: absolute; transform: translate(-50%, -50%);
    width: 44px; height: 44px; margin: 0; border-radius: 50%;
    border: 3px solid #ff3b30; box-shadow: 0 0 0 3px rgba(255,59,48,0.25);
    pointer-events: none;
  }
  .empty { color: #888; font-style: italic; }
  @media (prefers-color-scheme: dark) {
    body { color: #eaeaea; background: #1a1a1a; }
    .meta { color: #aaa; }
    .shot img { border-color: #333; }
  }
</style>
</head>
<body>
<h1>${escapeHtml(guide.title)}</h1>
<p class="meta">${escapeHtml(t.metaLine(formatDate(guide.createdAt), guide.steps.length))}</p>
${stepsHtml}
</body>
</html>
`;
}

function renderStepHtml(step: GuideStep): string {
  const caption = escapeHtml(stepCaption(step));
  const alt = escapeHtml(tMain().stepGuideDoc.stepAlt(step.order));

  // gif 스텝은 "직전 → 이번 클릭까지의 동작" 을 애니메이션으로 이미 담고 있어
  // 정지 포인터 마커가 의미 없다(클릭 지점이 애니메이션 마지막 프레임에서 자연히 드러남).
  // 마커를 얹으면 오히려 오해를 부르므로 gif 는 마커 없이 이미지만 렌더한다.
  if (step.kind === 'gif') {
    return `<section class="step">
  <h2>${caption}</h2>
  <div class="shot">
    <img src="${step.imageDataUrl}" alt="${alt}" width="${step.width}" height="${step.height}" />
  </div>
</section>`;
  }

  // image 스텝(정지 PNG) — 클릭 위치에 포인터 마커를 퍼센트로 오버레이(반응형).
  // width/height 가 0 이면(비정상) 50% 로 fallback 하되, 이는 캡처 검증에서 걸러진다.
  const leftPct = step.width > 0 ? (step.clickX / step.width) * 100 : 50;
  const topPct = step.height > 0 ? (step.clickY / step.height) * 100 : 50;
  return `<section class="step">
  <h2>${caption}</h2>
  <div class="shot">
    <img src="${step.imageDataUrl}" alt="${alt}" width="${step.width}" height="${step.height}" />
    <span class="marker" style="left:${leftPct.toFixed(2)}%; top:${topPct.toFixed(2)}%"></span>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// 파일명 헬퍼
// ---------------------------------------------------------------------------
/**
 * 스텝 이미지 파일명 규칙 — step-01.png / step-02.gif 형태(순번 zero-pad).
 * kind 에 따라 확장자를 가른다: image→png, gif→gif.
 */
export function stepImageFileName(order: number, kind: StepKind): string {
  const ext = kind === 'gif' ? 'gif' : 'png';
  return `step-${String(order).padStart(2, '0')}.${ext}`;
}

/** 원본 임시 캡처 경로에서 확장자만 확인(png 전제). 진단용. */
export function isPng(path: string): boolean {
  return basename(path).toLowerCase().endsWith('.png');
}

export { MARKER_RADIUS };
