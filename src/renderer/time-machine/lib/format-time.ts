/**
 * 경과 시간(초) → mm:ss 문자열.
 *
 * video-recorder/lib/format-time.ts 와 동일한 구현 — 형제 도메인 간 소형 유틸
 * 중복은 허용한다 (도메인 폴더가 자기 lib 를 갖는 folder-structure.md 규칙).
 */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
