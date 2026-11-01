import { useEffect, useState } from 'react';

type ReleaseAsset = { name: string; download_count: number };
type Release = { assets: ReleaseAsset[] };

/**
 * 릴리스마다 생기는 기본 다운로드 — 배포 직후 확인용·봇이 받는 몫으로 보이는 값.
 * 실측(2026-11): 릴리스 43개 중 30개가 .dmg 합계 2회 이하(대부분 정확히 2 = arm64·x64 각 1회).
 */
const BASELINE_PER_RELEASE = 2;

/**
 * 사람이 받은 신규 설치 다운로드 "횟수" 추정 — 릴리스별 .dmg download_count 합계에서
 * 기본 다운로드(BASELINE_PER_RELEASE)를 빼고 더한다.
 * GitHub 은 다운로드를 익명 횟수로만 집계한다(누가/몇 명인지는 제공하지 않음) — 같은 사람이
 * 여러 번 받은 경우는 여전히 섞여 있다.
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
        const total = releases.reduce((sum, rel) => {
          const dmgCount = (rel.assets ?? [])
            .filter((a) => a.name.endsWith('.dmg'))
            // download_count 는 API 가 항상 주지만, 외부 JSON 이라 누락 시 0 으로 본다.
            .reduce((n, a) => n + (a.download_count ?? 0), 0);
          return sum + Math.max(0, dmgCount - BASELINE_PER_RELEASE);
        }, 0);
        setCount(total);
      })
      .catch(() => {
        // 네트워크/레이트리밋 실패 시 배지를 숨긴 채 둔다(count=null) — 치명적이지 않음.
      });
  }, []);

  return count;
}
