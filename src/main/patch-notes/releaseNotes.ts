import type { Language } from '../../shared/i18n/language';

/** 언어별 마크다운 본문. */
export type LocalizedMarkdown = Record<Language, string>;

/** 저장소 release-notes/ 에 사람이 쓴 노트 한 버전 (ko·en 쌍). */
export type BundledReleaseNote = {
  /** `v` 없는 semver (예: '0.8.0'). */
  version: string;
  body: LocalizedMarkdown;
};

// release-notes/<version>.<lang>.md 를 main 번들에 문자열로 포함한다 — 실행 중 파일 IO·네트워크 없음.
// https://vite.dev/guide/features.html#glob-import (eager + query '?raw' + import 'default')
const files = import.meta.glob<string>('../../../release-notes/*.*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const FILE_RE = /\/(\d+\.\d+\.\d+)\.(ko|en)\.md$/;

function collect(): BundledReleaseNote[] {
  const byVersion = new Map<string, Partial<LocalizedMarkdown>>();
  for (const [path, text] of Object.entries(files)) {
    // README.md 등 규칙 밖 파일은 노트가 아니다.
    const m = FILE_RE.exec(path);
    if (!m) continue;
    const [, version, lang] = m;
    const entry = byVersion.get(version) ?? {};
    entry[lang as Language] = text;
    byVersion.set(version, entry);
  }
  const notes: BundledReleaseNote[] = [];
  for (const [version, body] of byVersion) {
    // 한 언어만 있는 버전은 쓰지 않는다(release-notes/README.md 규칙) — GitHub 본문으로 대신한다.
    if (body.ko === undefined || body.en === undefined) {
      console.warn(`[asis release-notes] ${version}: ko·en 중 하나가 없어 번들 노트에서 제외`);
      continue;
    }
    notes.push({ version, body: { ko: body.ko, en: body.en } });
  }
  return notes;
}

const bundled = collect();

/** 번들된 릴리스 노트 전체(순서 없음). */
export function getBundledReleaseNotes(): readonly BundledReleaseNote[] {
  return bundled;
}

/** 이 버전(앞의 `v` 무시)의 번들 노트가 있는가. */
export function hasBundledReleaseNote(version: string): boolean {
  const v = version.replace(/^v/, '');
  return bundled.some((n) => n.version === v);
}
