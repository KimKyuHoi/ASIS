/**
 * 내보낸 가이드 문서의 인라인 CSS — 단일 HTML 파일이라 외부 리소스 없이 자체 완결.
 *
 * 브랜드 기준 = 앱과 같은 design-system 토큰(src/renderer/design-system/asset/tokens.css,
 * macOS 26 AppKit 실측값). 문서는 앱 밖(받는 사람 브라우저)에서 열리므로 @import 할 수 없어
 * 필요한 값만 옮겨 적는다 — tokens.css 가 바뀌면 여기도 맞춘다.
 *   - 글꼴 --font-ui, 라벨 4단계, separator, fill-quaternary 그룹 박스(.mac-group 결), radius-group 10px.
 *   - 강조색은 ASIS 브랜드 오렌지(--p-orange-*): --accent(라이트 600 / 다크 500),
 *     흰 글자를 얹는 면은 --accent-fill(800), 작은 강조 글자는 --accent-tint-text
 *     (라이트 900 / 다크 400) — design-system 이 대비를 맞춘 조합 그대로.
 *   - 클릭 위치 표시는 문서가 그리지 않는다 — 편집 창의 기본 주석(빨간 동그라미)이 이미지에
 *     합성돼 오므로 사용자가 옮기거나 지운 결과가 그대로 보인다.
 * 크기만은 앱 UI(본문 13px)가 아니라 읽는 문서 기준(본문 16px, 1.25 배율)이다.
 */
export const GUIDE_CSS = `
:root {
  color-scheme: light dark;
  --font-ui: -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', sans-serif;
  --page: #ffffff;
  --label: rgba(0, 0, 0, 0.847);
  --label-secondary: rgba(0, 0, 0, 0.498);
  --separator: rgba(0, 0, 0, 0.098);
  --fill: rgba(0, 0, 0, 0.098);
  --group: rgba(0, 0, 0, 0.027);
  --accent: #ef6410;
  --accent-fill: #c2470a;
  --accent-ink: #a63c0a;
  --accent-soft: color-mix(in srgb, var(--accent) 14%, transparent);
  --red: #ff383c;
  --radius: 10px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --page: #1e1e1e;
    --label: rgba(255, 255, 255, 0.847);
    --label-secondary: rgba(255, 255, 255, 0.549);
    --separator: rgba(255, 255, 255, 0.098);
    --fill: rgba(255, 255, 255, 0.098);
    --group: rgba(255, 255, 255, 0.027);
    --accent: #ff7a1a;
    --accent-ink: #ff8f4a;
    --red: #ff4245;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--page);
  color: var(--label);
  font: 16px/1.65 var(--font-ui);
  -webkit-font-smoothing: antialiased;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.doc { max-width: 880px; margin: 0 auto; padding: 56px 16px 72px; }

/* 상단 바 — 화면 전용(인쇄·보기 모드에선 최소화). */
.bar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: 8px; justify-content: flex-end;
  padding: 10px 16px;
  background: color-mix(in srgb, var(--page) 82%, transparent);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  border-bottom: 1px solid transparent;
}
body[data-mode='edit'] .bar { border-bottom-color: var(--separator); }
.bar__hint { margin-right: auto; color: var(--label-secondary); font-size: 13px; display: none; }
body[data-mode='edit'] .bar__hint { display: block; }
.btn {
  appearance: none; border: none; background: var(--fill); color: var(--label);
  font: 500 13px/1 var(--font-ui); padding: 8px 14px; border-radius: 999px; cursor: pointer;
}
.btn:hover { background: color-mix(in srgb, var(--fill) 100%, var(--accent) 12%); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn--primary { background: var(--accent-fill); color: #fff; }
.btn--primary:hover { filter: brightness(1.06); }
body[data-mode='view'] [data-action='save'],
body[data-mode='view'] [data-action='view'],
body[data-mode='edit'] [data-action='edit'] { display: none; }

/* 머리말 */
.eyebrow {
  margin: 0 0 12px; color: var(--accent-ink);
  font-size: 13px; font-weight: 700; letter-spacing: 0.02em;
}
.title { margin: 0; font-size: 32px; line-height: 1.25; font-weight: 750; letter-spacing: -0.02em; }
.desc { margin: 14px 0 0; color: var(--label-secondary); font-size: 17px; white-space: pre-wrap; }
.meta { margin: 18px 0 0; color: var(--label-secondary); font-size: 13px; }

/* 단계 목록 — 번호는 CSS counter 로 매겨 순서 변경·삭제에도 자동으로 맞는다. */
.steps { list-style: none; margin: 40px 0 0; padding: 0; counter-reset: step; }
.step {
  counter-increment: step;
  margin: 0 0 20px; padding: 22px;
  background: var(--group); box-shadow: inset 0 0 0 0.5px var(--separator); border-radius: var(--radius);
  break-inside: avoid;
}
.step__head { display: flex; gap: 14px; align-items: flex-start; }
.step__num {
  flex: none; width: 30px; height: 30px; margin-top: 1px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--accent-fill); color: #fff; font-size: 14px; font-weight: 700;
}
.step__num::before { content: counter(step); }
.step__body { flex: 1; min-width: 0; }
.step__app {
  display: inline-block; margin: 0 0 4px; padding: 2px 8px; border-radius: 6px;
  background: var(--accent-soft); color: var(--accent-ink); font-size: 12px; font-weight: 600;
}
.step__caption { margin: 0; font-size: 20px; line-height: 1.4; font-weight: 650; letter-spacing: -0.01em; }
.step__note { margin: 6px 0 0; color: var(--label-secondary); white-space: pre-wrap; }
.step__tools { flex: none; display: none; gap: 4px; }
body[data-mode='edit'] .step__tools { display: flex; }
.tool {
  appearance: none; border: none; background: var(--fill); color: var(--label-secondary);
  font: 500 12px/1 var(--font-ui); padding: 6px 9px; border-radius: 8px; cursor: pointer;
}
.tool:hover { color: var(--label); }
.tool--danger:hover { color: var(--red); }
.step:first-child [data-action='up'], .step:last-child [data-action='down'] { visibility: hidden; }

/* 스크린샷 — 클릭 표시(빨간 동그라미)는 편집 창에서 이미지에 합성돼 온다. */
.shot { position: relative; margin: 18px 0 0; border-radius: 8px; overflow: hidden; box-shadow: 0 0 0 0.5px var(--separator); }
.shot img { display: block; width: 100%; height: auto; }
.footer { margin-top: 40px; color: var(--label-secondary); font-size: 12px; text-align: center; }

/* 편집 가능한 칸 */
[data-field] { border-radius: 6px; outline: none; }
body[data-mode='edit'] [data-field] { cursor: text; box-shadow: 0 0 0 1px transparent; transition: box-shadow 0.15s; }
body[data-mode='edit'] [data-field]:hover { box-shadow: 0 0 0 1px var(--separator); }
body[data-mode='edit'] [data-field]:focus { box-shadow: 0 0 0 2px var(--accent); background: var(--accent-soft); }
[data-field]:empty::before { content: attr(data-placeholder); color: var(--label-secondary); opacity: 0.7; }
body[data-mode='view'] [data-field]:empty { display: none; }

@media (max-width: 600px) {
  .doc { padding-top: 32px; }
  .title { font-size: 26px; }
  .step { padding: 16px; }
  .step__caption { font-size: 18px; }
  .step__head { flex-wrap: wrap; }
}
@media print {
  body { background: #fff; }
  .bar, .step__tools { display: none !important; }
  .step { border: none; padding: 0; }
}
`;
