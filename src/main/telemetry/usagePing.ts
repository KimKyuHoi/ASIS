import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import log from 'electron-log/main';
import { loadMisc, settingsStore } from '../settings';

/**
 * 익명 사용 통계 — 하루 한 번 집계 Worker(telemetry-worker/)에 {무작위 설치 ID, 앱 버전, macOS 버전}을 보낸다.
 * Worker 는 처음 보는 ID 를 설치 1건, (ID, 날짜) 를 하루 사용 1건으로 센다.
 *
 * - 개인을 알아볼 정보는 보내지 않는다. 설치 ID 는 이 기기에서 처음 만든 무작위 UUID 다.
 * - 설정 "익명 사용 통계 보내기"(misc.shareUsageStats)를 끄면 보내지 않는다.
 * - 패키징된 앱에서만 보낸다 — dev 실행이 통계를 오염시키지 않도록.
 *
 * side-effects.md — React 와 무관한 주기 작업이라 모듈 스코프 Class.
 */

// telemetry-worker 배포 주소 (wrangler deploy 출력의 workers.dev URL).
const TELEMETRY_URL = 'https://asis-telemetry.k546kh.workers.dev';
/** 앱 시작 직후 네트워크·창 준비와 겹치지 않게 조금 미룬다. */
const FIRST_PING_DELAY_MS = 30_000;
/** 켜 둔 채 날짜가 바뀌어도 하루 사용으로 잡히도록 몇 시간마다 날짜를 확인한다. */
const DAY_CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

/** UTC 기준 YYYY-MM-DD — Worker 의 하루 경계와 같게 맞춘다. */
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** 이 기기의 무작위 설치 ID. 없으면 만들어 저장한다. */
function installId(): string {
  const saved = settingsStore.get('installId');
  if (saved !== '') return saved;
  const id = randomUUID();
  settingsStore.set('installId', id);
  return id;
}

class UsagePing {
  private firstTimer: NodeJS.Timeout | null = null;
  private dayTimer: NodeJS.Timeout | null = null;
  private sending = false;

  start(): void {
    if (!app.isPackaged || this.dayTimer) return;
    this.firstTimer = setTimeout(() => this.pingIfNewDay(), FIRST_PING_DELAY_MS);
    this.dayTimer = setInterval(() => this.pingIfNewDay(), DAY_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.firstTimer) clearTimeout(this.firstTimer);
    if (this.dayTimer) clearInterval(this.dayTimer);
    this.firstTimer = null;
    this.dayTimer = null;
  }

  private pingIfNewDay(): void {
    if (this.sending || !loadMisc().shareUsageStats) return;
    const today = utcDay(new Date());
    if (settingsStore.get('lastUsagePingDay') === today) return;
    this.sending = true;
    this.send()
      .then(() => {
        settingsStore.set('lastUsagePingDay', today);
      })
      .catch((err: unknown) => {
        // 통계는 부가 기능 — 오프라인·서버 오류는 다음 확인 때 다시 시도하고 사용자에게 알리지 않는다.
        log.warn('[usage-ping] 전송 실패 — 다음 확인 때 다시 시도', err);
      })
      .finally(() => {
        this.sending = false;
      });
  }

  private async send(): Promise<void> {
    const res = await fetch(`${TELEMETRY_URL}/v1/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: installId(),
        version: app.getVersion(),
        os: `macOS ${process.getSystemVersion()}`,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`usage ping HTTP ${String(res.status)}`);
  }
}

export const usagePing = new UsagePing();
