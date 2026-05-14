/**
 * Conventional Commits + ASIS scope enum.
 *
 * 형식:   <type>(<scope>): <subject>
 * 예:    feat(capture): 영역 선택 오버레이 추가
 *        fix(editor): undo 스택 누수 수정
 *        chore(deps): konva 9.3.18 → 9.3.19
 *
 * 참고:
 *  - scope는 선택사항이지만, 적으면 아래 enum 중 하나여야 한다.
 *  - 도메인이 둘 이상이면 'editor,capture' 처럼 콤마로 묶을 수 있다.
 */

const scopes = [
  // ── Process layers ───────────────────────────────────────────
  'main',
  'preload',
  'renderer',

  // ── Feature modules ──────────────────────────────────────────
  'capture',     // screencapture 래퍼, 캡처 파이프라인
  'editor',      // 어노테이션 에디터 셸
  'overlay',     // 영역 선택 오버레이 윈도우
  'tools',       // Rectangle / Arrow / Pen / Text / Blur 등 도구
  'tray',        // 메뉴바 트레이
  'shortcuts',   // 글로벌 단축키
  'clipboard',   // 클립보드 입출력
  'ipc',         // 메인↔렌더러 IPC 레이어
  'state',       // zustand 스토어 / undo·redo
  'window',      // BrowserWindow 라이프사이클

  // ── Other ────────────────────────────────────────────────────
  'landing',      // 랜딩 페이지

  // ── Cross-cutting ────────────────────────────────────────────
  'build',
  'deps',
  'config',
  'lint',
  'ci',
  'docs',
  'release',
];

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat',
      'fix',
      'refactor',
      'perf',
      'style',
      'test',
      'chore',
      'docs',
      'build',
      'ci',
      'revert',
    ]],
    'scope-enum': [2, 'always', scopes],
    'scope-empty': [0],
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-case': [0],
    'subject-max-length': [2, 'always', 100],
    'header-max-length': [2, 'always', 120],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
  },
};
