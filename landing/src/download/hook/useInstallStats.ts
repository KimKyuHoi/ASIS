import { useEffect, useState } from 'react';
import { TELEMETRY_URL } from '../lib/telemetry';

export type InstallStats = {
  /** 집계 시작 전 추정치(baseline) + 앱이 보낸 첫 실행 수. */
  installs: number;
  /** 최근 30일 동안 앱을 켠 설치 수. */
  active30d: number;
};

type StatsResponse = { installs: number; baseline: number; active30d: number };

function isStatsResponse(value: unknown): value is StatsResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return [v.installs, v.baseline, v.active30d].every((n) => typeof n === 'number');
}

/**
 * 설치·사용자 수 — telemetry-worker 의 /v1/stats. 앱이 하루 한 번 보내는 익명 신호로 센다.
 * 불러오지 못하면 null — 화면은 GitHub 다운로드 수(useDownloadCount)로 대신한다.
 */
export function useInstallStats(): InstallStats | null {
  const [stats, setStats] = useState<InstallStats | null>(null);

  useEffect(() => {
    fetch(`${TELEMETRY_URL}/v1/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        if (!isStatsResponse(body)) return;
        setStats({ installs: body.installs + body.baseline, active30d: body.active30d });
      })
      .catch(() => {
        // 집계 서버 장애·차단 — 배지를 다운로드 수로 대신하므로 치명적이지 않다.
      });
  }, []);

  return stats;
}
