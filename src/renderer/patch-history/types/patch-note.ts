/** GitHub Releases 기반 패치 노트 한 건 (main/patchNotes.ts 와 동일 형태). */
export type PatchNote = {
  version: string;
  name: string;
  body: string;
  /** ISO 8601 게시일. */
  date: string;
};
