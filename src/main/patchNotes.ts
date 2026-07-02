/** GitHub Releases 기반 패치 노트(변경 이력) 한 건. */
export type PatchNote = {
  version: string;
  name: string;
  body: string;
  /** ISO 8601 게시일. */
  date: string;
};

// package.json build.publish 와 동일한 repo.
const RELEASES_URL = 'https://api.github.com/repos/KimKyuHoi/ASIS/releases';

/**
 * GitHub Releases 를 조회해 최신순 패치 노트를 반환.
 *
 * 인증 없이 public API 사용(시간당 60회 제한 — 뷰어 용도로 충분).
 * null-safety: 실패 시 명시 throw (렌더러가 에러 표시). draft 는 제외한다.
 */
export async function fetchPatchNotes(): Promise<PatchNote[]> {
  const res = await fetch(RELEASES_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub Releases 조회 실패 (HTTP ${res.status})`);
  }
  const data = (await res.json()) as Array<{
    tag_name: string;
    name: string | null;
    body: string | null;
    published_at: string;
    draft: boolean;
  }>;
  return data
    .filter((r) => !r.draft)
    .map((r) => ({
      version: r.tag_name,
      name: r.name && r.name.trim() ? r.name : r.tag_name,
      body: r.body ?? '',
      date: r.published_at,
    }));
}
