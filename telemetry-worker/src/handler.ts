/**
 * ASIS 익명 사용 통계 Worker 의 요청 처리 — 의존성 없는 순수 로직.
 * index.ts 가 Cloudflare D1 을 넘기고, 테스트는 node:sqlite 어댑터를 넘긴다.
 *
 * 엔드포인트
 *   POST /v1/ping  {id, version, os} — 앱이 하루 한 번 보낸다. 처음 보는 id 면 설치 1건,
 *                  (id, 오늘) 이 처음이면 하루 사용 1건.
 *   GET  /v1/stats — {installs, baseline, activeToday, active7d, active30d} — 랜딩이 읽는다.
 *                  baseline 은 집계를 시작하기 전(GitHub 다운로드 수로 추정한) 누적 값이다.
 */

/** D1Database 중 쓰는 부분만 — prepare(sql).bind(...).run()/first(). */
export type StatsDb = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>;
      first: <T = Record<string, unknown>>() => Promise<T | null>;
    };
  };
};

export type Stats = {
  /** 이 Worker 가 센 실제 설치 수. */
  installs: number;
  /** 집계 시작 전 누적 추정치 — 랜딩은 installs + baseline 을 보여 준다. */
  baseline: number;
  activeToday: number;
  active7d: number;
  active30d: number;
};

type PingBody = { id: string; version: string; os: string };

// crypto.randomUUID() 형식(v4). 다른 모양은 받지 않는다 — 임의 문자열로 행을 늘리는 것을 막는다.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9A-Za-z.]{1,20})?$/;
const MAX_OS_LENGTH = 40;
// 통계는 자주 바뀌지 않는다 — 랜딩 방문마다 D1 을 세 번 읽지 않도록 CDN·브라우저에 5분 둔다.
const STATS_MAX_AGE_S = 300;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra },
  });
}

/** 알 수 없는 JSON → 검증된 ping. 틀리면 null. */
export function parsePing(value: unknown): PingBody | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, version, os } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !UUID_V4.test(id)) return null;
  if (typeof version !== 'string' || !VERSION.test(version)) return null;
  if (typeof os !== 'string' || os.length === 0 || os.length > MAX_OS_LENGTH) return null;
  return { id, version, os };
}

/** UTC 기준 YYYY-MM-DD. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function daysAgo(now: Date, days: number): string {
  return utcDay(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}

export async function recordPing(db: StatsDb, ping: PingBody, now: Date): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO installs (id, first_version, os, created_at) VALUES (?, ?, ?, ?)')
    .bind(ping.id, ping.version, ping.os, now.toISOString())
    .run();
  await db
    .prepare('INSERT OR IGNORE INTO daily_active (id, day, version) VALUES (?, ?, ?)')
    .bind(ping.id, utcDay(now), ping.version)
    .run();
}

async function countRows(db: StatsDb, sql: string, ...values: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...values).first<{ n: number }>();
  // COUNT 는 항상 한 행을 돌려준다 — 없으면 DB 쪽 이상이라 0 으로 숨기지 않고 알린다.
  if (row === null) throw new Error(`count query returned no row: ${sql}`);
  return row.n;
}

export async function readStats(db: StatsDb, now: Date, baseline: number): Promise<Stats> {
  const activeSince = 'SELECT COUNT(DISTINCT id) AS n FROM daily_active WHERE day >= ?';
  return {
    installs: await countRows(db, 'SELECT COUNT(*) AS n FROM installs'),
    baseline,
    activeToday: await countRows(db, activeSince, utcDay(now)),
    active7d: await countRows(db, activeSince, daysAgo(now, 6)),
    active30d: await countRows(db, activeSince, daysAgo(now, 29)),
  };
}

/** wrangler.toml [vars] 의 문자열 → 0 이상의 정수. 잘못된 값이면 배포 설정 실수라 throw. */
export function parseBaseline(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`INSTALLS_BASELINE 이 0 이상의 정수가 아님: ${raw}`);
  return n;
}

export async function handleRequest(
  request: Request,
  db: StatsDb,
  now: Date,
  baseline = 0,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (pathname === '/v1/ping' && request.method === 'POST') {
    const ping = parsePing(await request.json().catch(() => null));
    if (!ping) return json({ error: 'invalid ping' }, 400);
    await recordPing(db, ping, now);
    return json({ ok: true });
  }

  if (pathname === '/v1/stats' && request.method === 'GET') {
    const stats = await readStats(db, now, baseline);
    return json(stats, 200, { 'Cache-Control': `public, max-age=${STATS_MAX_AGE_S}` });
  }

  return json({ error: 'not found' }, 404);
}
