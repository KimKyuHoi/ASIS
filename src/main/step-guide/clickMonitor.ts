import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { UserFacingError } from '../userFacingError';
import { tGuide } from './guideCopy';

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
 *     단순·안정적이며, "빌드 시 컴파일 → 번들 포함" 패턴을 쓴다.
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

/**
 * 전역 keyDown 한 건 — start({ keys: true }) 일 때만 온다(녹화 키 표시, input-highlight).
 * code 는 물리 키(macOS virtual keycode), chars 는 현재 입력 소스 기준 문자라 한글 자판에선
 * 한글이 온다 — 표시 라벨은 code 로 정하고 chars 는 표에 없는 키의 대체값으로만 쓴다.
 */
export type KeyPress = {
  code: number;
  cmd: boolean;
  ctrl: boolean;
  opt: boolean;
  shift: boolean;
  chars: string;
};

export type ClickMonitorOptions = {
  /** 전역 키 입력도 감지한다(헬퍼 `--keys`). 기본 false — 스텝 가이드는 클릭만 쓴다. */
  keys?: boolean;
};

export type ClickMonitorHandlers = {
  /** 전역 클릭 발생 — 좌표는 top-left origin(points). */
  onClick: (point: ClickPoint) => void;
  /** 헬퍼가 손쉬운 사용 신뢰를 못 받아 클릭을 못 잡는 상태로 시작됨. */
  onNotTrusted: () => void;
  /** 헬퍼가 비정상 종료(권한/버그) — stop() 호출 전 사망 시에만. */
  onExit: (info: { code: number | null; stderr: string }) => void;
  /** 키 입력 — options.keys 로 시작했을 때만 불린다. 진짜 옵셔널(스텝 가이드는 안 넘김). */
  onKey?: (key: KeyPress) => void;
};

/**
 * asis-clickmon 바이너리 경로.
 *   - prod: extraResources 로 앱 번들 Resources/asis-clickmon.
 *   - dev : 프로젝트 resources/bin/asis-clickmon (pnpm build:clickmon 산출물).
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
  start(handlers: ClickMonitorHandlers, options: ClickMonitorOptions = {}): void {
    if (this.child) {
      throw new Error('ClickMonitorManager.start() — 이미 실행 중');
    }
    const bin = clickMonBinaryPath();
    if (!existsSync(bin)) {
      // 조용히 넘어가지 않고 원인을 드러낸다. 사용자에겐 사전 문구, 경로·빌드 안내는 로그용 detail.
      throw new UserFacingError(
        tGuide().clickHelperMissing,
        `클릭 감지 바이너리를 찾을 수 없습니다: ${bin} — 'pnpm build:clickmon' 를 실행하세요`,
      );
    }

    this.stopping = false;
    this.stderrBuf = '';

    const args = options.keys ? ['--keys'] : [];
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;

    // stdio: 'pipe' 로 spawn 했으므로 타입상으로도 stdout/stderr 가 non-null 이다.
    const stdout = child.stdout;
    const stderr = child.stderr;

    const rl = createInterface({ input: stdout });
    this.rl = rl;
    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (options.keys) {
        const key = parseKeyLine(trimmed);
        if (key) {
          handlers.onKey?.(key);
          return;
        }
      }
      const point = parseClickLine(trimmed);
      if (!point) {
        // 알 수 없는 라인은 진단을 위해 로깅하되 흐름은 계속한다. 키 모드에선 라인에 사용자가
        // 친 글자가 들어 있을 수 있어 원문을 남기지 않는다.
        console.warn('[asis] clickMonitor: 파싱 불가 라인', options.keys ? `(${trimmed.length} chars)` : trimmed);
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

/**
 * 헬퍼 키 라인({"type":"key","code":21,"cmd":true,...})을 KeyPress 로 파싱.
 * 키 라인이 아니거나 형식이 안 맞으면 null.
 */
function parseKeyLine(line: string): KeyPress | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (o.type !== 'key') return null;
  const { code, cmd, ctrl, opt, shift, chars } = o;
  if (typeof code !== 'number' || !Number.isInteger(code)) return null;
  if (
    typeof cmd !== 'boolean' ||
    typeof ctrl !== 'boolean' ||
    typeof opt !== 'boolean' ||
    typeof shift !== 'boolean' ||
    typeof chars !== 'string'
  ) {
    return null;
  }
  return { code, cmd, ctrl, opt, shift, chars };
}
