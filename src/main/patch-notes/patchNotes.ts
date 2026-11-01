import { compareVersions } from './announce';
import { getBundledReleaseNotes, type LocalizedMarkdown } from './releaseNotes';

/** 변경 이력 한 건 — 번들 노트(release-notes/) 우선, 없으면 GitHub 릴리스 본문. */
export type PatchNote = {
  /** 태그 형태 (예: 'v0.8.0'). */
  version: string;
  name: string;
  /** 언어별 마크다운. GitHub 본문만 있는 옛 버전은 ko·en 이 같은 원문이다. */
  body: LocalizedMarkdown;
  /** ISO 8601 게시일. null = 아직 GitHub 에 게시되지 않은 버전(번들 노트만 있음). */
  date: string | null;
  /** GitHub 릴리스 페이지 URL — 클릭 시 브라우저로 이동. */
  url: string;
  /** release-notes/ 에서 온 노트인가. */
  bundled: boolean;
};

// package.json build.publish 와 동일한 repo.
const REPO_URL = 'https://github.com/KimKyuHoi/ASIS';
const RELEASES_URL = 'https://api.github.com/repos/KimKyuHoi/ASIS/releases';

/** GitHub Releases API 응답 중 쓰는 필드. */
type GitHubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string;
  html_url: string;
  draft: boolean;
};

/**
 * GitHub Releases 를 조회해 패치 노트로 바꾼다.
 *
 * 인증 없이 public API 사용(시간당 60회 제한 — 뷰어 용도로 충분).
 * null-safety: 실패 시 명시 throw. draft 는 제외한다.
 */
async function fetchGitHubNotes(): Promise<PatchNote[]> {
  const res = await fetch(RELEASES_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub Releases 조회 실패 (HTTP ${res.status})`);
  }
  const data = (await res.json()) as GitHubRelease[];
  return data
    .filter((r) => !r.draft)
    .map((r) => {
      // GitHub 응답의 body 는 null 일 수 있다(본문 없는 릴리스) — 빈 본문으로 표시.
      const body = r.body ?? '';
      return {
        version: r.tag_name,
        // 이름이 비었거나 공백뿐이면 태그로 대신한다.
        name: r.name?.trim() ? r.name : r.tag_name,
        body: { ko: body, en: body },
        date: r.published_at,
        url: r.html_url,
        bundled: false,
      };
    });
}

/**
 * 변경 이력 목록(최신 버전 먼저).
 *
 * 같은 버전에 번들 노트가 있으면 본문은 번들 노트, 날짜·링크는 GitHub 것을 쓴다.
 * GitHub 조회가 실패해도 번들 노트가 있으면 그것만 보여 준다(오프라인 첫 실행 공지).
 * 번들 노트도 없으면 GitHub 에러를 그대로 던진다 — 렌더러가 에러를 표시한다.
 */
export async function fetchPatchNotes(): Promise<PatchNote[]> {
  const bundled = getBundledReleaseNotes();
  let remote: PatchNote[];
  try {
    remote = await fetchGitHubNotes();
  } catch (err) {
    if (bundled.length === 0) throw err;
    // 번들 노트로 화면은 채울 수 있다 — 옛 버전 목록만 빠진다는 걸 로그로 남긴다.
    console.warn('[asis patch-notes] GitHub 조회 실패 — 번들 노트만 표시', err);
    remote = [];
  }

  const byVersion = new Map<string, PatchNote>();
  for (const note of remote) byVersion.set(note.version.replace(/^v/, ''), note);
  for (const note of bundled) {
    const tag = `v${note.version}`;
    const published = byVersion.get(note.version);
    byVersion.set(note.version, {
      version: tag,
      name: published ? published.name : tag,
      body: note.body,
      date: published ? published.date : null,
      // 게시 전이면 태그 페이지가 404 일 수 있다 — 링크는 보조라 그대로 둔다.
      url: published ? published.url : `${REPO_URL}/releases/tag/${tag}`,
      bundled: true,
    });
  }
  return [...byVersion.values()].sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * 변경 이력의 링크를 기본 브라우저로 연다 — https 만 허용.
 * 본문 마크다운은 GitHub 릴리스(외부 입력)에서도 오므로 file:/javascript: 등은 거절한다.
 */
export function assertPatchNoteUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`잘못된 링크: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`https 링크만 열 수 있습니다: ${url}`);
  }
  return parsed.toString();
}
