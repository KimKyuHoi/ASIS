import { app, shell } from 'electron';
import { existsSync } from 'node:fs';
import { copyFile, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tMain } from '../i18n/strings';
import type {
  TimeMachineHudPhase,
  TimeMachineHudState,
  TimeMachineHudWindowManager,
} from '../windows/timeMachineHudWindow';
import { probeProtectedContent } from './drmDetect';
import type { TimeMachineManager } from './timeMachine';

/** '저장됨' 알약을 유지하는 시간(ms). '파일 보기' 버튼을 누를 여유를 준다. */
const SAVED_HOLD_MS = 6000;
/** 안내(저장할 구간 없음·실패) 알약 유지 시간(ms). */
const NOTICE_HOLD_MS = 4000;

/**
 * 녹화 중 표시 위에 잠깐 덮이는 단계. 저장해도 녹화는 계속되므로 "실행 중"과는
 * 별개 축이다. null 이면 순수 녹화 중.
 */
type Overlay =
  | { kind: 'saving' } |
  { kind: 'saved'; seconds: number; path: string } |
  { kind: 'notice'; message: string } |
  null;

/** 트레이가 읽는 축약 단계 — 메뉴바 타이틀 전환용. */
export type TimeMachineSavePhase = 'saving' | 'saved' | null;

export type TimeMachineControllerDeps = {
  manager: TimeMachineManager;
  hud: TimeMachineHudWindowManager;
  /** 설정은 호출 시점의 최신 값을 읽어야 하므로 값이 아니라 getter 로 받는다. */
  bufferSeconds: () => number;
  drmDetectEnabled: () => boolean;
  /** 화면 녹화 권한 확인 — 거부 시 false (안내는 내부에서 이미 처리됨). */
  guardCapture: () => Promise<boolean>;
  notifyInfo: (body: string) => void;
  notifyError: (body: string) => void;
  /** 클릭 가능한 알림 — 저장 완료 시 누르면 Finder 에서 파일을 연다. */
  notifyAction: (body: string, onClick: () => void) => void;
  /** 트레이 라벨·타이틀 갱신 요청. */
  onStateChanged: () => void;
};

/**
 * 타임머신 시작/정지/저장의 단일 조율 지점.
 *
 * 왜 index.ts 에서 분리했나
 *   상태가 두 축(실행 중 / 저장 단계)이고, 그 상태를 알림·트레이·HUD 세 곳이
 *   동시에 봐야 한다. index.ts 안에 지역 변수와 타이머로 흩어 두면 어느 경로가
 *   어떤 표시를 갱신하는지 추적이 안 된다. 여기서 상태를 한 곳에 모으고,
 *   바뀔 때마다 세 채널에 같은 사실을 뿌린다.
 *
 * side-effects.md Rule 3 — React 무관한 lifecycle/상태이므로 Class.
 */
export class TimeMachineController {
  private overlay: Overlay = null;
  private overlayTimer: NodeJS.Timeout | null = null;
  /** 녹화 시작 시각(epoch ms). HUD 경과 시간 기준. 미실행이면 null. */
  private startedAt: number | null = null;
  /**
   * 토글 진행 중 재진입 차단. 없으면 ⌘⇧T 연타 시 stop 이 중복 실행되어
   * "정지했습니다" 알림이 두 번 뜬다 (로그에서 실제 관측된 증상).
   */
  private transitioning = false;
  /** 마지막으로 저장한 파일 경로 — '파일 보기'/알림 클릭 대상. */
  private lastSavedPath: string | null = null;

  constructor(private readonly deps: TimeMachineControllerDeps) {}

  isRunning(): boolean {
    return this.deps.manager.isRunning();
  }

  /** 트레이 메뉴바 타이틀용 축약 단계. */
  savePhase(): TimeMachineSavePhase {
    if (!this.overlay) return null;
    if (this.overlay.kind === 'saving') return 'saving';
    if (this.overlay.kind === 'saved') return 'saved';
    // notice 는 메뉴바 타이틀에 굳이 띄우지 않는다 — HUD/알림으로 이미 전달된다.
    return null;
  }

  /** ⌘⇧T — 실행 중이면 정지, 아니면 시작. */
  toggle(): void {
    if (this.transitioning) return;
    if (this.isRunning()) {
      this.stopRecording();
      return;
    }
    this.startRecording();
  }

  /** ⌘⇧S — 지금까지 버퍼에 남은 최근 구간을 파일로 저장. 녹화는 계속된다. */
  save(): void {
    const { manager, bufferSeconds, notifyInfo } = this.deps;
    if (!manager.isRunning()) {
      notifyInfo(tMain().timeMachine.notRunning);
      return;
    }
    // 이미 저장 중이면 무시 — concat 중 재요청은 같은 세그먼트를 두 번 쓴다.
    if (this.overlay?.kind === 'saving') return;

    this.setOverlay({ kind: 'saving' });
    manager
      .save()
      .then(
        async (result) => {
          if (result.kind === 'empty') {
            this.setOverlay({ kind: 'notice', message: tMain().timeMachine.emptyShort });
            notifyInfo(tMain().timeMachine.empty(bufferSeconds()));
            return;
          }
          await this.finishSave(result.path, result.approxSeconds);
        },
        (err: unknown) => this.failSave(err),
      )
      // finishSave 안(복사 실패 등)에서 던진 에러는 위 onRejected 를 지나쳐 오므로
      // 여기서 받는다 — 저장 실패가 조용히 사라지지 않게.
      .catch((err: unknown) => this.failSave(err));
  }

  /** HUD '파일 보기' / 저장 알림 클릭 — Finder 에서 마지막 저장 파일을 표시. */
  reveal(): void {
    const path = this.lastSavedPath;
    if (!path) {
      // 저장 이력이 없을 때 눌릴 수 있는 경로는 없지만(버튼이 saved 단계에만 뜸),
      // 조용히 넘기지 않고 사유를 남긴다.
      console.warn('[asis] timemachine reveal: 저장된 파일 경로 없음');
      return;
    }
    if (!existsSync(path)) {
      this.deps.notifyError(tMain().timeMachine.revealMissing(basename(path)));
      return;
    }
    shell.showItemInFolder(path);
  }

  /** 앱 종료 경로 — 타이머와 HUD 정리. 녹화 프로세스 자체는 manager.dispose() 담당. */
  dispose(): void {
    this.clearOverlayTimer();
    this.overlay = null;
    this.startedAt = null;
    this.deps.hud.stop();
  }

  /**
   * ffmpeg 가 스스로 죽었을 때(권한 거부 등) 호출된다. 토글을 거치지 않으므로
   * 여기서 표시를 실제 상태에 맞춘다 — 안 그러면 알약이 "녹화 중"인 채 남는다.
   */
  handleEarlyExit(): void {
    this.clearOverlayTimer();
    this.overlay = null;
    this.startedAt = null;
    this.deps.hud.stop();
    // 프로세스는 죽었지만 세그먼트 디렉토리는 남아 있다. 여기서 정리하지 않으면
    // 사용자가 다시 시작할 때 새 디렉토리가 만들어져 tmp 에 버퍼가 쌓인다
    // (child 가 이미 없으므로 manager.stop() 은 디렉토리 정리만 하고 끝난다).
    this.deps.manager.stop().catch((err: unknown) => {
      console.warn('[asis] timemachine early-exit cleanup failed', err);
    });
    this.deps.notifyError(tMain().timeMachine.diedUnexpectedly);
    this.deps.onStateChanged();
  }

  private startRecording(): void {
    const { manager, hud, guardCapture, bufferSeconds, notifyInfo, notifyError } = this.deps;
    this.transitioning = true;
    guardCapture()
      .then((ok) => {
        if (!ok) return undefined;
        const buf = bufferSeconds();
        // rect 미지정 = 커서가 있는 디스플레이 전체를 상시 녹화.
        return manager.start(undefined, buf).then(
          () => {
            this.startedAt = Date.now();
            this.overlay = null;
            hud.start(this.hudState(buf), {
              onSave: () => this.save(),
              onStop: () => this.toggle(),
              onReveal: () => this.reveal(),
            });
            notifyInfo(tMain().timeMachine.started(buf));
          },
          (err: unknown) => {
            notifyError(tMain().timeMachine.startFailed(message(err)));
          },
        );
      })
      .finally(() => {
        this.transitioning = false;
        this.deps.onStateChanged();
      });
  }

  private stopRecording(): void {
    const { manager, hud, notifyInfo, notifyError } = this.deps;
    this.transitioning = true;
    // 표시는 실제 정지를 기다리지 않고 즉시 내린다 — 사용자가 정지를 누른 순간
    // 알약이 남아 있으면 "안 꺼졌나?" 로 읽힌다.
    this.clearOverlayTimer();
    this.overlay = null;
    this.startedAt = null;
    hud.stop();
    manager
      .stop()
      .then(
        () => notifyInfo(tMain().timeMachine.stopped),
        (err: unknown) => notifyError(tMain().timeMachine.stopFailed(message(err))),
      )
      .finally(() => {
        this.transitioning = false;
        this.deps.onStateChanged();
      });
  }

  /** concat 결과 임시 파일을 최종 위치로 옮기고 저장 완료를 알린다. */
  private async finishSave(tmpPath: string, approxSeconds: number): Promise<void> {
    const { drmDetectEnabled, notifyError, notifyAction } = this.deps;

    // DRM 감지 — near-black 이면 경고(휴리스틱, 오탐 가능). 저장은 막지 않는다.
    if (drmDetectEnabled()) {
      const probe = await probeProtectedContent(tmpPath).catch((err: unknown) => {
        console.warn('[asis] DRM 감지 실패(무시하고 저장 진행)', err);
        return null;
      });
      if (probe && probe.kind === 'protected') {
        notifyError(tMain().timeMachine.drmWarning(probe.ymax));
      }
    }

    const dest = uniquePath(app.getPath('videos'), timeMachineFileBase(new Date()), '.mp4');
    try {
      await copyFile(tmpPath, dest);
    } catch (err: unknown) {
      // 임시 파일은 남겨두지 않는다 — 복사 실패해도 버퍼 사본은 정리.
      await unlink(tmpPath).catch((e: unknown) => {
        console.warn('[asis] timemachine tmp cleanup failed', e);
      });
      throw new Error(tMain().timeMachine.copyFailed(message(err)));
    }
    await unlink(tmpPath).catch((e: unknown) => {
      console.warn('[asis] timemachine tmp cleanup failed', e);
    });

    this.lastSavedPath = dest;
    this.setOverlay({ kind: 'saved', seconds: approxSeconds, path: dest });
    notifyAction(tMain().timeMachine.saved(approxSeconds, basename(dest)), () => this.reveal());
  }

  private failSave(err: unknown): void {
    this.setOverlay({ kind: 'notice', message: tMain().timeMachine.saveFailedShort });
    this.deps.notifyError(tMain().timeMachine.saveFailed(message(err)));
  }

  /**
   * overlay 교체 + 자동 해제 예약. saved/notice 는 잠깐 보여주고 녹화 표시로 되돌린다.
   * 녹화가 이미 멈춘 뒤라면 HUD 는 닫혀 있으므로 갱신은 트레이에만 반영된다.
   */
  private setOverlay(next: Overlay): void {
    this.clearOverlayTimer();
    this.overlay = next;
    this.syncHud();
    this.deps.onStateChanged();

    if (!next || next.kind === 'saving') return;
    const holdMs = next.kind === 'saved' ? SAVED_HOLD_MS : NOTICE_HOLD_MS;
    this.overlayTimer = setTimeout(() => {
      this.overlayTimer = null;
      this.overlay = null;
      this.syncHud();
      this.deps.onStateChanged();
    }, holdMs);
  }

  private clearOverlayTimer(): void {
    if (!this.overlayTimer) return;
    clearTimeout(this.overlayTimer);
    this.overlayTimer = null;
  }

  private syncHud(): void {
    if (!this.deps.hud.isVisible()) return;
    this.deps.hud.update(this.hudState(this.deps.bufferSeconds()));
  }

  private hudState(bufferSeconds: number): TimeMachineHudState {
    return {
      phase: this.hudPhase(),
      bufferSeconds,
      // 실행 중에만 HUD 가 떠 있으므로 startedAt 은 사실상 항상 있다.
      // 방어적으로 지금 시각을 쓰면 경과가 00:00 으로 리셋될 뿐 오동작은 없다.
      startedAt: this.startedAt ?? Date.now(),
    };
  }

  private hudPhase(): TimeMachineHudPhase {
    const overlay = this.overlay;
    if (!overlay) return { kind: 'recording' };
    if (overlay.kind === 'saved') return { kind: 'saved', seconds: overlay.seconds };
    if (overlay.kind === 'notice') return { kind: 'notice', message: overlay.message };
    return { kind: 'saving' };
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `ASIS-TimeMachine-20260727-104233` — 정렬 가능하고 사람이 읽을 수 있는 이름. */
function timeMachineFileBase(now: Date): string {
  const p = (n: number): string => n.toString().padStart(2, '0');
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `ASIS-TimeMachine-${date}-${time}`;
}

/**
 * 같은 초에 두 번 저장하면 파일명이 겹친다 — 덮어쓰지 않고 -2, -3 을 붙인다.
 * existsSync 와 실제 쓰기 사이의 race 는 이 앱(단일 프로세스, 사용자 트리거)에서
 * 현실적으로 발생하지 않는다.
 */
function uniquePath(dir: string, base: string, ext: string): string {
  const first = join(dir, `${base}${ext}`);
  if (!existsSync(first)) return first;
  for (let i = 2; i < 100; i++) {
    const candidate = join(dir, `${base}-${i}${ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`저장 파일명 확보 실패 — ${base} 이름이 이미 99개 있음`);
}
