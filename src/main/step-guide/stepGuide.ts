import { copyFile, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { app, dialog, nativeImage, screen } from 'electron';
import { captureRegion } from '../capture/capture';
import { SequenceCaptureManager } from '../capture/sequenceCapture';
import { getElementBoundsAtPoint } from '../windowsInfo';
import {
  ClickMonitorManager,
  type ClickPoint,
} from './clickMonitor';
import {
  toHtml,
  toMarkdown,
  stepImageFileName,
  type Guide,
  type GuideStep,
  type StepKind,
} from './stepGuideExport';
import { tMain } from '../i18n/strings';

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
 *   5. stop() — 감지 중지 + (녹화 중이면) GIF cancel 후 Markdown/HTML 로 export.
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
  /** export 완료 — 저장 경로 또는 사용자 취소. */
  onExported: (result: { kind: 'saved'; path: string } | { kind: 'canceled' }) => void;
  /** export 실패. */
  onExportError: (message: string) => void;
  /** 스텝이 기록 없이 종료됨 — "기록된 클릭 없음" 안내. */
  onEmpty: () => void;
};

/** 캡처된 스텝의 raw 데이터(export 전 중간 표현). */
type RawStep = {
  order: number;
  /** 'image'=클릭 시점 정지 PNG, 'gif'=[GIF 시작]~[GIF 정지] 구간 연속 애니메이션. */
  kind: StepKind;
  imagePath: string;
  imageDataUrl: string;
  width: number;
  height: number;
  clickX: number;
  clickY: number;
  timestamp: number;
  label?: string;
};

export class StepGuideManager {
  private monitor = new ClickMonitorManager();
  /** 연속 GIF 녹화기 — [GIF 시작]에서 start, [GIF 정지]에서 stop 으로 하나의 GIF 를 만든다. */
  private seq = new SequenceCaptureManager();
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

  isActive(): boolean {
    return this.monitor.isRunning();
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
        const detail = info.stderr || `exit ${info.code ?? 'null'}`;
        callbacks.onError(tMain().stepGuide.clickDetectionStopped(detail));
        callbacks.onStateChange({ kind: 'idle' });
      },
    });

    this.emitRecording();
  }

  /**
   * 녹화 중지 + export. format 에 따라 Markdown 또는 HTML 로 저장 다이얼로그.
   * 녹화 중이 아니면 no-op.
   */
  stop(format: 'markdown' | 'html'): void {
    if (!this.monitor.isRunning()) return;
    const callbacks = this.callbacks;
    if (!callbacks) throw new Error('StepGuideManager.stop — callbacks 미설정');

    this.monitor.stop();
    // 세대 증가 — 이 시점 이후 resolve 되는 in-flight 캡처/인코딩은 세대 대조로 폐기된다.
    this.sessionId += 1;
    // 진행 중이던 GIF 는 [GIF 정지]를 안 눌렀으므로 미완성 → 버린다.
    // cancel 은 비동기(tmp 폴더 정리)지만 export 를 막을 이유가 없어 fire-and-forget.
    this.cancelSequenceIfRecording();
    this.gifPhase = { kind: 'idle' };
    callbacks.onStateChange({ kind: 'idle' });

    const collected = this.steps;
    this.steps = [];

    if (collected.length === 0) {
      callbacks.onEmpty();
      return;
    }

    // export 는 비동기(파일 쓰기 + 다이얼로그). 에러는 명시 콜백으로.
    this.exportGuide(collected, format, callbacks).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      callbacks.onExportError(message);
    });
  }

  /**
   * export 없이 감지만 중지 — 앱 종료/창 강제 닫힘 경로용.
   * 다이얼로그를 띄우지 않으므로 종료를 막지 않는다. 누적 스텝은 폐기(임시 PNG 는
   * OS tmp 정리에 맡긴다 — screencapture 다른 경로들과 동일한 취급).
   * 멱등(비활성이면 no-op).
   */
  stopSilently(): void {
    if (!this.monitor.isRunning()) return;
    this.monitor.stop();
    this.sessionId += 1; // in-flight 캡처/인코딩 폐기.
    this.cancelSequenceIfRecording(); // 진행 중 GIF 폐기(tmp 폴더 정리).
    this.gifPhase = { kind: 'idle' };
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

    this.finalizeGifStep(rect, session).catch((err: unknown) => {
      console.error('[asis] stepGuide: GIF 스텝 마감 실패', err);
    });
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

    const session = this.sessionId;
    this.captureImageStep(point).then(
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
  }

  /**
   * 정지 이미지 스텝 캡처 — point 가 속한 디스플레이 전체의 정지 PNG 를 image 스텝으로.
   *   - 클릭의 이미지 내 픽셀 좌표 = (clickDip - displayOrigin) * scaleFactor.
   *   - AX 요소 이름 조회(권한 있으면). 실패 시 라벨 없이 진행.
   * 캡처 취소/빈 이미지면 null 반환(스텝 미기록).
   */
  private async captureImageStep(point: ClickPoint): Promise<RawStep | null> {
    // point 는 top-left origin DIP(clickMonitor 가 flip 완료). 이 좌표가 속한
    // 디스플레이를 찾아 그 전체를 캡처한다 — 다중 모니터 안전.
    const display = screen.getDisplayNearestPoint({ x: point.x, y: point.y });
    const b = display.bounds;

    // AX 라벨은 캡처 *전에* 조회한다 — 캡처 후엔 화면이 바뀌었을 수 있음.
    // 권한 없거나 실패 시 null → 라벨 없이 진행(정상 fallback).
    const element = getElementBoundsAtPoint(point.x, point.y);
    const label = element?.name;

    const cap = await captureRegion({ x: b.x, y: b.y, w: b.width, h: b.height });
    if (cap.kind !== 'success') {
      // 사용자 취소(ESC) 등 — 스텝 미기록.
      console.warn('[asis] stepGuide: 캡처가 성공하지 않음', cap.kind);
      return null;
    }

    const image = nativeImage.createFromPath(cap.path);
    if (image.isEmpty()) {
      console.warn('[asis] stepGuide: 캡처 이미지가 비어 있음', cap.path);
      return null;
    }
    const size = image.getSize();

    // 클릭의 이미지 내 픽셀 좌표. screencapture 는 physical px 출력이므로 scaleFactor 적용.
    const sf = display.scaleFactor || 1;
    const clickX = Math.round((point.x - b.x) * sf);
    const clickY = Math.round((point.y - b.y) * sf);

    const order = this.steps.length + 1;
    return {
      order,
      kind: 'image',
      imagePath: cap.path,
      imageDataUrl: image.toDataURL(),
      width: size.width,
      height: size.height,
      clickX,
      clickY,
      timestamp: Date.now(),
      label,
    };
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
      if (buf.length === 0) {
        console.warn('[asis] stepGuide: GIF 파일이 비어 있음', gifPath);
        return;
      }
      // GIF 는 nativeImage.toDataURL 이 첫 프레임만 담을 수 있어(애니메이션 소실),
      // 파일 바이트를 직접 base64 dataURL 로 만든다(실측: HTML <img> 에서 애니메이션 유지).
      const imageDataUrl = `data:image/gif;base64,${buf.toString('base64')}`;

      // GIF 픽셀 크기 = [GIF 시작] 디스플레이 bounds × scaleFactor(screencapture 는 physical px).
      const width = Math.round(rect.width * rect.scaleFactor);
      const height = Math.round(rect.height * rect.scaleFactor);

      const order = this.steps.length + 1;
      this.steps.push({
        order,
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

  /** 누적 스텝을 문서로 저장. */
  private async exportGuide(
    rawSteps: RawStep[],
    format: 'markdown' | 'html',
    callbacks: StepGuideCallbacks,
  ): Promise<void> {
    const guide = buildGuide(rawSteps);

    const isMd = format === 'markdown';
    const defaultName = isMd ? 'guide.md' : 'guide.html';
    const filterName = isMd ? 'Markdown' : 'HTML';
    const ext = isMd ? 'md' : 'html';

    const result = await dialog.showSaveDialog({
      title: tMain().stepGuide.saveDialogTitle,
      // 문서 폴더를 기본 저장 위치로 — 임시 폴더(tmpdir)는 경로가 깊어 찾기 어렵다.
      defaultPath: join(app.getPath('documents'), defaultName),
      filters: [{ name: filterName, extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) {
      callbacks.onExported({ kind: 'canceled' });
      return;
    }
    const outPath = result.filePath;

    if (isMd) {
      // Markdown 은 이미지를 상대 경로 참조 → 문서와 같은 폴더에 step-NN.png/gif 저장.
      const outDir = dirname(outPath);
      const fileNames = guide.steps.map((s) => stepImageFileName(s.order, s.kind));
      // 파일들을 병렬로 쓴다. no-await-in-loop 룰 준수 위해 Promise.all.
      // image → PNG 재인코딩 저장, gif → tmp GIF 파일을 그대로 복사(재인코딩 금지).
      await Promise.all(
        guide.steps.map((step, i) => {
          const dest = join(outDir, fileNames[i]);
          if (step.kind === 'gif') {
            return copyFile(step.imagePath, dest);
          }
          return writeStepImage(dest, step.imageDataUrl);
        }),
      );
      const md = toMarkdown(guide, fileNames);
      await writeFile(outPath, md, 'utf8');
    } else {
      // HTML 은 data URL 임베드 → 단일 파일(gif 도 base64 dataURL 로 임베드됨).
      const html = toHtml(guide);
      await writeFile(outPath, html, 'utf8');
    }

    // export 성공 후 tmp GIF 파일 정리(image PNG 는 기존처럼 OS tmp 정리에 맡긴다).
    // 저장이 끝난 뒤라 지워도 안전. 실패는 로그만(정리 실패가 export 성공을 무르지 않음).
    await this.cleanupTmpGifs(guide.steps);

    callbacks.onExported({ kind: 'saved', path: outPath });
  }

  /** export 후 gif 스텝의 tmp GIF 파일 삭제. no-await-in-loop → Promise.all. */
  private async cleanupTmpGifs(steps: GuideStep[]): Promise<void> {
    await Promise.all(
      steps
        .filter((s) => s.kind === 'gif')
        .map((s) =>
          unlink(s.imagePath).catch((err: unknown) => {
            if (!isEnoent(err)) {
              console.warn('[asis] stepGuide: tmp GIF 정리 실패', s.imagePath, err);
            }
          }),
        ),
    );
  }
}

/** RawStep[] → export 용 Guide. 제목은 첫 스텝 시각 기준. */
function buildGuide(rawSteps: RawStep[]): Guide {
  const createdAt = Date.now();
  const steps: GuideStep[] = rawSteps.map((r) => ({
    order: r.order,
    kind: r.kind,
    imagePath: r.imagePath,
    imageDataUrl: r.imageDataUrl,
    width: r.width,
    height: r.height,
    clickX: r.clickX,
    clickY: r.clickY,
    timestamp: r.timestamp,
    label: r.label,
  }));
  return {
    title: tMain().stepGuideDoc.title(steps.length),
    createdAt,
    steps,
  };
}

/** data URL(PNG)을 파일로 저장 — Markdown export 의 상대 이미지 쓰기(image 스텝). */
async function writeStepImage(path: string, dataUrl: string): Promise<void> {
  // nativeImage 로 재인코딩하면 손실 없이 PNG 버퍼를 얻는다(원본이 PNG data URL).
  // gif 스텝은 이 경로를 쓰지 않는다 — nativeImage 는 애니메이션 GIF 를 보존하지 못하므로
  // exportGuide 에서 copyFile 로 원본 GIF 를 그대로 복사한다.
  const img = nativeImage.createFromDataURL(dataUrl);
  if (img.isEmpty()) {
    throw new Error(`가이드 이미지 저장 실패(빈 이미지): ${path}`);
  }
  await writeFile(path, img.toPNG());
}

/** ENOENT(파일 없음) 판별 — 이미 지워진 tmp 파일 정리 시 무시용. */
function isEnoent(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
