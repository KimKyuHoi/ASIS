import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * 전역 마우스 클릭 감지 — Swift NSEvent global monitor 헬퍼(asis-clickmon)를 spawn 해
 * 클릭 좌표 스트림을 콜백으로 흘려보낸다.
 *
 * 왜 Class 인가 (side-effects.md Rule 3):
 *   전역 마우스 이벤트 탭은 React 데이터 흐름과 무관한 외부 시스템 lifecycle 이다.
 *   장기 실행 child process(asis-clickmon)를 소유하고 start/stop 으로 켜고 끄며,
 *   React 는 이 인스턴스를 건드리지 않는다 (StepGuideManager 가 소유). 모듈 스코프
 *   Class 가 정확히 맞는 예 — screenRecord.ts 의 ScreenRecordManager 와 동일한 결.
 *
 * 왜 useEffect/koffi 가 아닌가:
 *   - useEffect: 이건 main process 코드다. React 자체가 없다.
 *   - koffi(CGEventTap): main process 의 Electron CF run loop 와 event tap run loop
 *     소스 통합이 까다롭다. 실측상 Swift 별도 프로세스 + NSEvent global monitor 가
 *     단순·안정적이며, asis-ocr 와 동일한 "빌드 시 컴파일 → 번들 포함" 패턴을 재사용한다.
 *
 * 좌표계:
 *   헬퍼는 top-left origin(points) 좌표를 emit 한다 — screencapture -R / Electron
 *   screen API 와 동일. 별도 변환 없이 그대로 캡처에 쓸 수 있다.
 *   (asis-clickmon.swift 의 flip 주석 참고. 실측 검증됨.)
 *
 * 권한:
 *   전역 마우스 감지는 손쉬운 사용(Accessibility) 신뢰가 필요하다. 헬퍼는 시작 시
 *   stderr 로 `ready trusted=<bool>` 를 보낸다. trusted=false 면 클릭 콜백이 오지
 *   않으므로 onNotTrusted 콜백으로 호출자에게 알려 사용자 안내를 띄우게 한다.
 */

export type ClickPoint = { x: number; y: number };

export type ClickMonitorHandlers = {
  /** 전역 클릭 발생 — 좌표는 top-left origin(points). */
  onClick: (point: ClickPoint) => void;
  /** 헬퍼가 손쉬운 사용 신뢰를 못 받아 클릭을 못 잡는 상태로 시작됨. */
  onNotTrusted: () => void;
  /** 헬퍼가 비정상 종료(권한/버그) — stop() 호출 전 사망 시에만. */
  onExit: (info: { code: number | null; stderr: string }) => void;
};

/**
 * asis-clickmon 바이너리 경로.
 *   - prod: extraResources 로 앱 번들 Resources/asis-clickmon.
 *   - dev : 프로젝트 resources/bin/asis-clickmon (pnpm build:clickmon 산출물).
 * asis-ocr(ocr.ts)와 동일한 해석 규칙.
 */
function clickMonBinaryPath(): string {
  const prod = join(process.resourcesPath, 'asis-clickmon');
  if (existsSync(prod)) return prod;
  return join(app.getAppPath(), 'resources', 'bin', 'asis-clickmon');
}

export class ClickMonitorManager {
  private child: ChildProcess | null = null;
  private rl: Interface | null = null;
  /** stop() 로 정상 종료 요청했는지 — 조기 사망(권한 거부 등)과 구분. */
  private stopping = false;
  private stderrBuf = '';

  isRunning(): boolean {
    return this.child !== null;
  }

  /**
   * 감지 시작 — 헬퍼 프로세스를 spawn 하고 stdout 라인 파싱을 건다.
   * 이미 실행 중이면 명시 throw (null-safety: silent 재시작 금지).
   */
  start(handlers: ClickMonitorHandlers): void {
    if (this.child) {
      throw new Error('ClickMonitorManager.start() — 이미 실행 중');
    }
    const bin = clickMonBinaryPath();
    if (!existsSync(bin)) {
      // 조용히 넘어가지 않고 원인을 드러낸다.
      throw new Error(
        `클릭 감지 바이너리를 찾을 수 없습니다: ${bin} — 'pnpm build:clickmon' 를 실행하세요`,
      );
    }

    this.stopping = false;
    this.stderrBuf = '';

    const child = spawn(bin, [], { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;

    // stdout child.stdout 은 spawn(stdio pipe)에서 항상 존재하지만, 타입상 nullable 이라
    // 명시 체크 후 진행한다 (non-null assertion 금지 룰).
    const stdout = child.stdout;
    const stderr = child.stderr;
    if (!stdout || !stderr) {
      this.child = null;
      child.kill('SIGKILL');
      throw new Error('클릭 감지: 헬퍼 stdout/stderr 파이프 생성 실패');
    }

    const rl = createInterface({ input: stdout });
    this.rl = rl;
    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const point = parseClickLine(trimmed);
      if (!point) {
        // 알 수 없는 라인은 진단을 위해 로깅하되 흐름은 계속한다.
        console.warn('[asis] clickMonitor: 파싱 불가 라인', trimmed);
        return;
      }
      handlers.onClick(point);
    });

    stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      this.stderrBuf += text;
      // 시작 신호에서 신뢰 여부 확인 — trusted=false 면 클릭이 안 잡히니 안내.
      if (text.includes('trusted=false')) {
        handlers.onNotTrusted();
      }
    });

    child.on('error', (err) => {
      // spawn 자체 실패(파일 없음/권한 등). stop 여부와 무관하게 알린다.
      if (this.stopping) return;
      this.cleanupRefs();
      handlers.onExit({ code: null, stderr: `spawn 실패: ${err.message}` });
    });

    child.on('close', (code) => {
      const wasStopping = this.stopping;
      const collected = this.stderrBuf.trim();
      this.cleanupRefs();
      if (wasStopping) return;
      // 정상 정지 요청 없이 죽음 = 권한 문제 또는 헬퍼 버그.
      handlers.onExit({ code, stderr: collected });
    });
  }

  /**
   * 감지 정지 — 헬퍼 프로세스를 종료한다. 멱등(이미 정지면 no-op).
   * SIGTERM 으로 run loop 를 자연 종료시킨다.
   */
  stop(): void {
    if (!this.child) return;
    this.stopping = true;
    this.rl?.close();
    this.child.kill('SIGTERM');
    // close 이벤트에서 참조 정리. 만약 SIGTERM 무시 시 대비해 강제 종료 예약.
    const child = this.child;
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, 1000);
  }

  private cleanupRefs(): void {
    this.rl?.close();
    this.rl = null;
    this.child = null;
  }
}

/**
 * 헬퍼 stdout 한 줄({"x":123,"y":45})을 ClickPoint 로 파싱.
 * 형식이 안 맞으면 null — 호출자가 로깅 후 skip 한다.
 */
function parseClickLine(line: string): ClickPoint | null {
  // JSON.parse 실패를 조용히 삼키지 않기 위해 try/catch 를 좁게 감싼다.
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('x' in parsed) ||
    !('y' in parsed)
  ) {
    return null;
  }
  const x = (parsed as { x: unknown }).x;
  const y = (parsed as { y: unknown }).y;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}
