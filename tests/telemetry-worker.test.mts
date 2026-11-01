import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
// handler.ts 는 import 가 없는 순수 TS 라 Node 의 타입 제거 실행으로 바로 불러온다.
import {
  handleRequest,
  parsePing,
  parseBaseline,
  readStats,
  recordPing,
  utcDay,
  type StatsDb,
} from '../telemetry-worker/src/handler.ts';

/** D1 binding 과 같은 모양(prepare/bind/run/first)으로 node:sqlite 를 감싼다 — 실제 SQL 을 검증한다. */
function createDb(): StatsDb {
  const sqlite = new DatabaseSync(':memory:');
  const schema = fs.readFileSync(
    path.join(import.meta.dirname, '../telemetry-worker/schema.sql'),
    'utf8',
  );
  sqlite.exec(schema);
  return {
    prepare: (sql) => ({
      bind: (...values) => {
        const stmt = sqlite.prepare(sql);
        const params = values as (string | number | null)[];
        return {
          run: () => Promise.resolve(stmt.run(...params)),
          first: <T>() => Promise.resolve((stmt.get(...params) ?? null) as T | null),
        };
      },
    }),
  };
}

const ID_A = '3b241101-e2bb-4255-8caf-4136c566a962';
const ID_B = 'a3bb189e-8bf9-4888-9912-ace4e6543002';
type Ping = { id: string; version: string; os: string };
const ping = (id: string, version = '0.8.1'): Ping => ({ id, version, os: 'macOS 26.3' });

test('parsePing: v4 UUID·semver·짧은 os 만 받는다', () => {
  assert.deepEqual(parsePing(ping(ID_A)), ping(ID_A));
  assert.equal(parsePing({ ...ping(ID_A), id: 'not-a-uuid' }), null);
  assert.equal(parsePing({ ...ping(ID_A), version: 'latest' }), null);
  assert.equal(parsePing({ ...ping(ID_A), os: 'x'.repeat(41) }), null);
  assert.equal(parsePing(null), null);
});

test('같은 id 는 설치 1건, 같은 날 여러 번 켜도 하루 사용 1건', async () => {
  const db = createDb();
  const now = new Date('2026-11-02T09:00:00Z');
  await recordPing(db, ping(ID_A), now);
  await recordPing(db, ping(ID_A), new Date('2026-11-02T20:00:00Z'));
  await recordPing(db, ping(ID_B), now);
  assert.deepEqual(await readStats(db, now, 85), {
    installs: 2,
    baseline: 85,
    activeToday: 2,
    active7d: 2,
    active30d: 2,
  });
});

test('기간별 사용자 수 — 오늘·7일·30일 경계', async () => {
  const db = createDb();
  const now = new Date('2026-11-30T12:00:00Z');
  await recordPing(db, ping(ID_A), new Date('2026-11-24T12:00:00Z')); // 6일 전 → 7일 안
  await recordPing(db, ping(ID_B), new Date('2026-11-01T12:00:00Z')); // 29일 전 → 30일 안
  const stats = await readStats(db, now, 0);
  assert.equal(stats.installs, 2);
  assert.equal(stats.activeToday, 0);
  assert.equal(stats.active7d, 1);
  assert.equal(stats.active30d, 2);
  assert.equal(utcDay(now), '2026-11-30');
});

test('handleRequest: ping 저장, 잘못된 body 400, stats 캐시 헤더', async () => {
  const db = createDb();
  const now = new Date('2026-11-02T09:00:00Z');
  const ok = await handleRequest(
    new Request('https://t.example/v1/ping', { method: 'POST', body: JSON.stringify(ping(ID_A)) }),
    db,
    now,
  );
  assert.equal(ok.status, 200);
  const bad = await handleRequest(
    new Request('https://t.example/v1/ping', { method: 'POST', body: '{"id":"x"}' }),
    db,
    now,
  );
  assert.equal(bad.status, 400);
  const stats = await handleRequest(new Request('https://t.example/v1/stats'), db, now, 85);
  assert.equal(stats.headers.get('Cache-Control'), 'public, max-age=300');
  assert.equal(stats.headers.get('Access-Control-Allow-Origin'), '*');
  const body = (await stats.json()) as { installs: number; baseline: number };
  assert.equal(body.installs, 1);
  assert.equal(body.baseline, 85);
  const missing = await handleRequest(new Request('https://t.example/nope'), db, now);
  assert.equal(missing.status, 404);
});

test('parseBaseline: 빈 값은 0, 정수만 허용', () => {
  assert.equal(parseBaseline(undefined), 0);
  assert.equal(parseBaseline('85'), 85);
  assert.throws(() => parseBaseline('-1'));
  assert.throws(() => parseBaseline('8.5'));
});
