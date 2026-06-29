import { useEffect, useState } from 'react';

type ReleaseAsset = { name: string; download_count: number };
type Release = { assets: ReleaseAsset[] };

/**
 * 모든 릴리스의 .dmg 에셋 download_count 합계 = 신규 설치 누적 다운로드 "횟수".
 * GitHub 은 다운로드를 익명 횟수로만 집계한다(누가/몇 명인지는 제공하지 않음).
 * .zip/blockmap/latest-mac.yml(자동 업데이트 트래픽)은 빼려고 .dmg 만 합산한다.
 */
export function useDownloadCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    // per_page=100 — 현재 릴리스 수엔 충분. 100개 초과 시 페이지네이션이 필요하다.
    fetch('https://api.github.com/repos/KimKyuHoi/ASIS/releases?per_page=100')
      .then((r) => r.json())
      .then((releases: Release[]) => {
        if (!Array.isArray(releases)) return;
        const total = releases
          .flatMap((rel) => rel.assets ?? [])
          .filter((a) => a.name.endsWith('.dmg'))
          // download_count 는 API 가 항상 주지만, 외부 JSON 이라 누락 시 0 으로 본다.
          .reduce((sum, a) => sum + (a.download_count ?? 0), 0);
        setCount(total);
      })
      .catch(() => {
        // 네트워크/레이트리밋 실패 시 배지를 숨긴 채 둔다(count=null) — 치명적이지 않음.
      });
  }, []);

  return count;
}
