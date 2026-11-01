import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { screen } from 'electron';
import { SequenceCaptureManager } from '../capture/sequenceCapture';
import {
  ClickMonitorManager,
  type ClickPoint,
} from './clickMonitor';
import type { Guide } from './stepGuideExport';
import {
  buildGuide,
  captureImageStep,
  cleanupTmpGifs,
  isEnoent,
  type RawStep,
} from './stepCapture';
import { tGuide } from './guideCopy';

/**
 * 스텝바이스텝 가이드 생성기 오케스트레이터 — 수동 이미지/GIF 모드.
 *
 * 흐름 (수동):
 *   1. start() — ClickMonitorManager 로 전역 클릭 감지 시작. 기본은 *이미지 모드*.
 *   2. 이미지 모드에서 전역 클릭 → 그 시점 커서 디스플레이 전체의 *정지 PNG* 를
 *      캡처(+ AX 라벨) → image 스텝 누적.
 *   3. HUD 에서 [GIF 시작] → startGif(): 그 시점부터 *연속 GIF* 녹화 시작.
 *      이 동안 들어온 전역 클릭은 개별 스텝을 만들지 않고 GIF 안에 그대로 담긴다.
 *   4. HUD 에서 [GIF 정지] → stopGif(): seq.stop 으로 하나의 GIF 로 인코딩 →
 *      *하나의* gif 스텝 누적. 이후 다시 이미지 모드.
 *   5. stop() — 감지 중지 + (녹화 중이면) GIF cancel 후 누적 스텝을 Guide 로 넘긴다.
 *      문서화·편집 창은 호출자(StepGuideWindowManager)가 맡는다 — 저장 위치는 사용자가
 *      편집을 끝내고 [저장]할 때 정한다.
 *
 * side-effects.md Rule 3 — 전역 클릭 탭 + 캡처/GIF 파이프라인은 React 무관 lifecycle →
 * 모듈 스코프 Class. ClickMonitorManager·SequenceCaptureManager 를 소유하고 켜고 끈다.
 *
 * null-safety.md — 캡처 실패/빈 이미지/권한 없음/GIF 0프레임을 명시 분기, skip 하되 로그.
 *
 * 상태 변화를 외부(트레이/HUD)에 알리기 위해 onStateChange 콜백을 받는다.
 */

/** 스텝 가이드 GIF 의 *목표 캡처* fps — 5 고정(프레임 간격 200ms).
 *  misc.gifFps(GIF 녹화 전용 15)는 여기서 재사용하지 않는다: 스텝 가이드 GIF 는
 *  "동작을 천천히 보여주는" 용도라 성기게 찍는 편이 낫다.
 *  재생 fps 는 이 값이 아니라 실측 캡처 속도다 — sequenceCapture.playbackFps 참고. */
const GIF_FPS = 5;

/** GIF 캡처 영역 — [GIF 시작] 시점 커서 디스플레이 bounds(DIP) + scaleFactor. */
type GifRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
};

export type StepGuideState =
  | { kind: 'idle' } |
  { kind: 'recording'; stepCount: number; gifRecording: boolean };

export type StepGuideCallbacks = {
  /** 상태 변화 — HUD/트레이 갱신용. */
  onStateChange: (state: StepGuideState) => void;
  /** 손쉬운 사용 권한 없음 — 사용자 안내 필요. */
  onNeedsAccessibility: () => void;
  /** 헬퍼 비정상 종료 알림(권한/버그). */
  onError: (message: string) => void;
  /** 녹화 종료 — 편집 창을 띄울 가이드. 스텝이 0개면 대신 onEmpty. */
  onReady: (guide: Guide) => void;
  /** 스텝이 기록 없이 종료됨 — "기록된 클릭 없음" 안내. */
  onEmpty: () => void;
  /**
   * 이 좌표(top-left DIP)가 ASIS 자신의 창(녹화 알약·편집 창) 위인지 — 그 클릭은 단계가 아니다.
   * 클릭 감지 헬퍼(asis-clickmon)는 별도 프로세스라, 전역 모니터가 "자기 앱 이벤트는 안 받는다"는
   * 규칙이 ASIS 창에는 적용되지 않는다(헬퍼에게 ASIS 는 다른 앱).
   */
  isOwnWindowAt: (point: ClickPoint) => boolean;
};

export class StepGuideManager {
  private readonly monitor = new ClickMonitorManager();
  /** 연속 GIF 녹화기 — [GIF 시작]에서 start, [GIF 정지]에서 stop 으로 하나의 GIF 를 만든다. */
  private readonly seq = new SequenceCaptureManager();
  private steps: RawStep[] = [];
  /**
   * GIF 녹화 상태 머신 — [GIF 시작]/[GIF 정지] 는 seq.start/stop 이 비동기(각각 수백 ms)라
   * 연타/중복 IPC 에 취약하다. phase 를 *동기적으로* 먼저 전이시켜 이중 start·start↔stop
   * 겹침을 막는다.
   *   - idle      : 이미지 모드(전역 클릭 = image 스텝).
   *   - starting  : seq.start() in-flight. 이 동안 재-startGif 무시, stopGif 는 시작 취소.
   *   - recording : 녹화 중. 전역 클릭은 GIF 에 담기고 개별 스텝 안 만듦.
   *   - stopping  : seq.stop()(인코딩) in-flight. 이 동안 startGif/stopGif 모두 무시.
   * rect 는 recording/stopping 에서만 의미 있음([GIF 시작] 디스플레이 bounds, DIP).
   */
  private gifPhase:
    | { kind: 'idle' } |
    { kind: 'starting'; canceled: boolean } |
    { kind: 'recording'; rect: GifRect } |
    { kind: 'stopping' } = { kind: 'idle' };
  private callbacks: StepGuideCallbacks | null = null;
  /**
   * 세션 세대 카운터 — start() 마다 +1. 캡처/인코딩은 비동기라, 정지/새 세션 시작 후에
   * 늦게 resolve 된 결과가 새 세션의 steps 를 오염시키지 않도록 세대를 대조한다.
   */
  private sessionId = 0;
  /**
   * 진행 중인 캡처(클릭 스텝)·GIF 마감 — [완료]가 이것들을 기다린 뒤 가이드를 만든다.
   * 마지막 클릭 직후나 [GIF 정지] 인코딩 중에 [완료]를 눌러도 그 단계가 사라지지 않게.
   */
  private readonly pending = new Set<Promise<unknown>>();
  /** stop() 후 pending 을 기다리는 중 — 이 동안은 새 녹화를 시작하지 않는다(isActive 가 true). */
  private finishing = false;

  isActive(): boolean {
    // 마무리 중(진행 중 캡처·GIF 인코딩 대기)도 활성으로 본다 — 그 사이 단축키/트레이가
    // 새 녹화를 시작해 이전 녹화 결과를 덮어쓰지 않게.
    return this.monitor.isRunning() || this.finishing;
  }

  /** stop() 후 진행 중 캡처·GIF 인코딩을 기다리는 중인지 — 이때 HUD 가 닫혀도 결과를 버리면 안 된다. */
  isFinishing(): boolean {
    return this.finishing;
  }

  /** 녹화 시작. 이미 활성이면 명시 throw(silent 재시작 금지). */
  start(callbacks: StepGuideCallbacks): void {
    if (this.monitor.isRunning()) {
      throw new Error('StepGuideManager.start() — 이미 녹화 중');
    }
    this.callbacks = callbacks;
    this.steps = [];
    this.gifPhase = { kind: 'idle' };
    this.sessionId += 1;

    this.monitor.start({
      onClick: (point) => {
        this.handleClick(point);
      },
      onNotTrusted: () => {
        callbacks.onNeedsAccessibility();
      },
      onExit: (info) => {
        // stop() 없이 죽음 — 권한 문제 또는 헬퍼 버그. 상태를 idle 로 되돌린다.
        // stderr·exit code 는 개발자용 원문 — 로그에만 남기고 사용자에겐 사전 문구.
        const detail = info.stderr || `exit ${info.code ?? 'null'}`;
        console.error('[asis] stepGuide: 클릭 감지 헬퍼 비정상 종료', detail);
        callbacks.onError(tGuide().clickDetectionStopped);
        callbacks.onStateChange({ kind: 'idle' });
      },
    });

    this.emitRecording();
  }

  /**
   * 녹화 중지 → 진행 중인 캡처·GIF 마감을 기다린 뒤 누적 스텝을 Guide 로 onReady 에
   * 넘긴다(0개면 onEmpty). 녹화 중이 아니면 no-op.
   *
   * 클릭 감지는 즉시 끈다(이후 클릭은 안 받음). 세대(sessionId)는 *기다린 뒤에* 올린다 —
   * 먼저 올리면 in-flight 결과가 세대 대조에 걸려 버려진다(마지막 단계 유실).
   */
  stop(): void {
    if (!this.monitor.isRunning()) return;
    const callbacks = this.callbacks;
    if (!callbacks) throw new Error('StepGuideManager.stop — callbacks 미설정');

    // 감지를 끄기 *전에* 마무리 중으로 표시 — isActive 가 한 순간도 false 로 빠지지 않아
    // 트레이가 idle → 녹화 중 → idle 로 깜빡이거나 그 틈에 새 녹화가 끼어들지 않는다.
    this.finishing = true;
    this.monitor.stop();
    // [GIF 정지]를 안 누른 채 녹화 중이던 GIF 는 미완성 → 버린다. 인코딩 중(stopping)인
    // GIF 는 seq 가 이미 비활성이라 여기서 취소되지 않고 아래 pending 으로 기다린다.
    this.cancelSequenceIfRecording();
    this.gifPhase = { kind: 'idle' };
    callbacks.onStateChange({ kind: 'idle' });

    const session = this.sessionId;
    Promise.allSettled([...this.pending])
      .then(() => {
        this.finishing = false;
        // 마무리가 끝났음을 알린다 — 트레이 "녹화 중" 표시를 내리는 계기(isActive 가 false 로 바뀜).
        callbacks.onStateChange({ kind: 'idle' });
        // 기다리는 사이 새 녹화가 시작됐으면(start 가 steps 를 비우고 세대를 올림) 손대지 않는다.
        if (session !== this.sessionId) return;
        this.sessionId += 1;
        this.finishCollected(callbacks);
      })
      .catch((err: unknown) => {
        this.finishing = false;
        callbacks.onStateChange({ kind: 'idle' });
        // onReady/onEmpty 콜백 안의 예외 — 녹화 결과 전달 실패라 로그로 드러낸다.
        console.error('[asis] stepGuide: 녹화 마무리 실패', err);
      });
  }

  private finishCollected(callbacks: StepGuideCallbacks): void {
    const collected = this.steps;
    this.steps = [];
    if (collected.length === 0) {
      callbacks.onEmpty();
      return;
    }
    callbacks.onReady(buildGuide(collected));
    // gif 는 dataURL 로 이미 Guide 에 담겼으니 tmp 파일은 바로 지운다.
    cleanupTmpGifs(collected);
  }

  /** in-flight 작업 등록 — 끝나면(성공·실패 무관) 스스로 빠진다. */
  private track(work: Promise<unknown>): void {
    this.pending.add(work);
    const forget = (): void => {
      this.pending.delete(work);
    };
    work.then(forget, forget);
  }

  /**
   * 편집 창 없이 정지·폐기 — 앱 종료/HUD 강제 닫힘/클릭 헬퍼 비정상 종료 경로용.
   * 다이얼로그를 띄우지 않으므로 종료를 막지 않는다. 멱등.
   *
   * monitor 가 이미 죽어 있어도(헬퍼 비정상 종료 → onExit → HUD 닫힘 → 여기) 나머지
   * 정리는 반드시 한다 — GIF 녹화가 돌던 중이면 screencapture 루프가 남아 다음 세션의
   * startGif 가 "이미 녹화 중" 으로 계속 실패한다.
   */
  stopSilently(): void {
    if (this.monitor.isRunning()) this.monitor.stop();
    this.sessionId += 1; // in-flight 캡처/인코딩 폐기.
    this.cancelSequenceIfRecording(); // 진행 중 GIF 폐기(tmp 폴더 정리).
    this.gifPhase = { kind: 'idle' };
    cleanupTmpGifs(this.steps); // 마감된 GIF 스텝의 tmp 파일(수 MB씩).
    this.steps = [];
    this.callbacks?.onStateChange({ kind: 'idle' });
  }

  /**
   * GIF 녹화 시작 — [GIF 시작] 버튼.
   * idle 이 아니면(비활성·이미 starting/recording/stopping) 무시 — 연타/중복 IPC 방어.
   * phase 를 *동기적으로* starting 으로 먼저 올린 뒤 seq.start(비동기)를 호출해
   * 이중 start 를 막는다. 시작 성공 시 recording 으로, 실패 시 idle 로 되돌린다.
   */
  startGif(): void {
    if (!this.monitor.isRunning()) return;
    if (this.gifPhase.kind !== 'idle') return;

    // 커서가 속한 디스플레이를 대상으로 — 다중 모니터 안전.
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const b = display.bounds;
    const rect: GifRect = {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      scaleFactor: display.scaleFactor || 1,
    };

    // 동기 전이 — 이 시점 이후 재-startGif 는 위 guard 에서 걸린다.
    const phase = { kind: 'starting' as const, canceled: false };
    this.gifPhase = phase;
    this.emitRecording();

    this.seq
      .start({ rect: { x: b.x, y: b.y, w: b.width, h: b.height }, fps: GIF_FPS, cursor: true })
      .then(
        () => {
          // start 진행 중 stopGif/stop/재시작이 있었으면(canceled·phase 교체·세션 변경)
          // 이 녹화는 버린다.
          if (phase.canceled || this.gifPhase !== phase || !this.monitor.isRunning()) {
            this.cancelSequenceIfRecording();
            // stopGif 로 취소된 게 아니라 phase 가 그대로 starting 인데 세션만 죽은 경우
            // idle 로 되돌린다(정지 경로에선 이미 idle 로 세팅됨).
            if (this.gifPhase === phase) this.gifPhase = { kind: 'idle' };
            return;
          }
          this.gifPhase = { kind: 'recording', rect };
          this.emitRecording();
        },
        (err: unknown) => {
          // 시작 실패 — 이미지 모드로 되돌린다(단, 그 사이 정지/재시작됐으면 건드리지 않음).
          console.error('[asis] stepGuide: GIF 시작 실패', err);
          if (this.gifPhase === phase) {
            this.gifPhase = { kind: 'idle' };
            this.emitRecording();
          }
        },
      );
  }

  /**
   * GIF 녹화 정지 — [GIF 정지] 버튼.
   *   - recording: 인코딩(stopping)으로 전이 → seq.stop → gif 스텝 하나 누적.
   *   - starting : seq.start 가 아직 in-flight → canceled 표시만 하고 그 resolve 에서 취소.
   *   - idle/stopping: 무시(연타/중복 방어).
   * 0프레임/인코딩 실패면 스텝 미기록·로그.
   */
  stopGif(): void {
    if (!this.monitor.isRunning()) return;
    const phase = this.gifPhase;

    if (phase.kind === 'starting') {
      // 아직 seq.start 진행 중 — 시작 콜백이 취소를 처리하도록 표시하고 이미지 모드로.
      phase.canceled = true;
      this.gifPhase = { kind: 'idle' };
      this.emitRecording();
      return;
    }
    if (phase.kind !== 'recording') return; // idle/stopping 무시.

    const rect = phase.rect;
    const session = this.sessionId;
    // 동기 전이 — 인코딩(수백 ms) 중 startGif 재진입·중복 stopGif 를 guard 로 막는다.
    this.gifPhase = { kind: 'stopping' };
    this.emitRecording();

    this.track(
      this.finalizeGifStep(rect, session).catch((err: unknown) => {
        console.error('[asis] stepGuide: GIF 스텝 마감 실패', err);
      }),
    );
  }

  /** 진행 중인 GIF 녹화를 취소(tmp 프레임 폐기). 녹화 중 아니면 no-op. */
  private cancelSequenceIfRecording(): void {
    if (!this.seq.isRecording()) return;
    // cancel 은 비동기(rm) 지만 종료 흐름을 막지 않도록 fire-and-forget + 에러 로깅.
    this.seq.cancel().catch((err: unknown) => {
      console.warn('[asis] stepGuide: GIF cancel 실패', err);
    });
  }

  /**
   * 전역 클릭 한 번 처리.
   *   - GIF phase 가 idle 이 아니면(starting/recording/stopping) 무시 — 그 클릭은
   *     GIF 프레임에 담기거나 GIF 시작/정지 전이 중이므로 개별 image 스텝을 안 만든다.
   *   - idle 이면 정지 PNG 를 image 스텝으로 캡처해 누적.
   * 캡처는 비동기지만 클릭마다 독립적이라(트랜잭션 직렬화 불필요) 바로 실행한다.
   * phase 판정은 *클릭 시점*(동기 진입)에 한다 — 캡처 도중 [GIF 시작]이 눌려도
   * 이 클릭은 GIF 시작 전의 것이므로 image 스텝으로 남기는 게 맞다.
   */
  private handleClick(point: ClickPoint): void {
    if (this.gifPhase.kind !== 'idle') return;
    // 클릭은 start() 이후에만 온다 — callbacks 가 없으면 버그.
    const callbacks = this.callbacks;
    if (!callbacks) throw new Error('StepGuideManager.handleClick — callbacks 미설정');
    // 알약 버튼([GIF]·[취소]·[정지])·편집 창 클릭은 기록하지 않는다.
    if (callbacks.isOwnWindowAt(point)) return;

    const session = this.sessionId;
    const work = captureImageStep(point).then(
      (step) => {
        // 캡처 도중 정지·재시작됐으면 결과 폐기(steps 오염 방지).
        if (session !== this.sessionId) return;
        if (!step) return;
        this.steps.push(step);
        this.emitRecording();
      },
      (err: unknown) => {
        // 한 클릭 처리 실패가 전체 녹화를 죽이지 않게 — 로깅 후 계속.
        console.error('[asis] stepGuide: 클릭 처리 실패', err);
      },
    );
    this.track(work);
  }

  /**
   * [GIF 정지] — 진행 중이던 연속 GIF 를 하나의 gif 스텝으로 마감한다.
   *   1) seq.stop(tmpGif) 로 인코딩 → GIF 경로. (0프레임 등 실패 시 스텝 미기록·로그.)
   *   2) GIF 파일을 base64 로 읽어 dataURL 생성(HTML 임베드용 — 애니메이션 유지).
   * width/height 는 [GIF 시작] 시 저장한 rect(× scaleFactor)로 계산한다.
   * clickX/clickY 는 gif 가 마커를 그리지 않으므로 0(마커 미표시). label 은 없음.
   */
  private async finalizeGifStep(rect: GifRect, session: number): Promise<void> {
    try {
      const tmpGif = this.tmpGifPath();
      let gifPath: string;
      try {
        gifPath = await this.seq.stop(tmpGif);
      } catch (err) {
        // 인코딩 실패(0프레임/ffmpeg 오류 등) — 이 GIF 는 잃지만 녹화는 계속.
        console.error('[asis] stepGuide: GIF 인코딩 실패', err);
        return;
      }

      // 인코딩 도중 정지·재시작됐으면 결과 폐기(steps 오염 방지) + tmp GIF 정리.
      if (session !== this.sessionId) {
        unlink(gifPath).catch((err: unknown) => {
          if (!isEnoent(err)) {
            console.warn('[asis] stepGuide: 고아 tmp GIF 정리 실패', gifPath, err);
          }
        });
        return;
      }

      const buf = await readFile(gifPath);
      // readFile 을 기다리는 사이 정지·재시작됐을 수 있다 — 세대를 다시 확인한다.
      if (session !== this.sessionId) {
        cleanupTmpGifs([{ kind: 'gif', imagePath: gifPath }]);
        return;
      }
      if (buf.length === 0) {
        console.warn('[asis] stepGuide: GIF 파일이 비어 있음', gifPath);
        // 스텝으로 쓰지 않으니 빈 tmp 파일도 여기서 치운다(누적 스텝에 안 들어가 정리 경로가 없음).
        cleanupTmpGifs([{ kind: 'gif', imagePath: gifPath }]);
        return;
      }
      // GIF 는 nativeImage.toDataURL 이 첫 프레임만 담을 수 있어(애니메이션 소실),
      // 파일 바이트를 직접 base64 dataURL 로 만든다(실측: HTML <img> 에서 애니메이션 유지).
      const imageDataUrl = `data:image/gif;base64,${buf.toString('base64')}`;

      // GIF 픽셀 크기 = [GIF 시작] 디스플레이 bounds × scaleFactor(screencapture 는 physical px).
      const width = Math.round(rect.width * rect.scaleFactor);
      const height = Math.round(rect.height * rect.scaleFactor);

      this.steps.push({
        kind: 'gif',
        imagePath: gifPath,
        imageDataUrl,
        width,
        height,
        // gif 는 마커를 그리지 않으므로 클릭 좌표는 0(export 에서 gif 는 마커 미표시).
        clickX: 0,
        clickY: 0,
        timestamp: Date.now(),
      });
    } finally {
      // 인코딩 성공/실패/폐기 어느 경로든 stopping 을 풀어 이미지 모드로 되돌린다.
      // 단, 그 사이 stop()/stopSilently()/재시작이 phase 를 이미 바꿨으면 건드리지 않는다.
      if (session === this.sessionId && this.gifPhase.kind === 'stopping') {
        this.gifPhase = { kind: 'idle' };
        this.emitRecording();
      }
    }
  }

  /** GIF 임시 파일 경로 — 세션당 여러 개 가능하므로 pid+시각+세대로 충돌 방지. */
  private tmpGifPath(): string {
    return join(
      tmpdir(),
      `asis-stepguide-${process.pid}-${Date.now()}-${this.sessionId}.gif`,
    );
  }

  /** 현재 녹화 상태를 HUD/트레이로 push. */
  private emitRecording(): void {
    // GIF 가 활성(시작 중/녹화 중/인코딩 중)이면 HUD 는 "GIF 녹화 중"으로 표시한다 —
    // 전이 중에도 버튼이 [GIF 정지] 로 유지돼 이중 트리거를 막는다(idle 에서만 [GIF 시작]).
    const gifRecording = this.gifPhase.kind !== 'idle';
    this.callbacks?.onStateChange({
      kind: 'recording',
      stepCount: this.steps.length,
      gifRecording,
    });
  }
}
