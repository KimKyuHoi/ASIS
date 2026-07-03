import { copyFile, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { app, dialog, nativeImage, screen } from 'electron';
import { captureRegion } from '../capture/capture';
import { SequenceCaptureManager } from '../capture/sequenceCapture';
import { loadMisc } from '../settings';
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

/**
 * 스텝바이스텝 가이드 생성기 오케스트레이터.
 *
 * 흐름 (자동 GIF):
 *   1. start() — ClickMonitorManager 로 전역 클릭 감지 시작.
 *   2. 첫 클릭  → 그 시점 커서 디스플레이 전체의 *정지 PNG* 를 캡처(+ AX 라벨) →
 *      image 스텝 누적. 그 직후 SequenceCaptureManager 로 *다음 구간* GIF 녹화 시작.
 *   3. 이후 클릭 → 진행 중이던 구간을 GIF 로 인코딩(seq.stop)해 *직전 클릭 ~ 이번 클릭*
 *      동작을 담은 gif 스텝으로 누적. 그 직후 다시 seq.start 로 다음 구간 녹화 시작.
 *      (즉 "N-1 → N 으로 이동하는 동작" 이 스텝 N 의 GIF.)
 *   4. 마지막 클릭 이후 ~ 정지 사이 구간은 다음 클릭이 없어 완성되지 못하므로 버린다.
 *   5. stop() — 감지 중지 + 진행 중 구간 cancel 후 Markdown/HTML 문서로 export.
 *
 * side-effects.md Rule 3 — 전역 클릭 탭 + 캡처/GIF 파이프라인은 React 무관 lifecycle →
 * 모듈 스코프 Class. ClickMonitorManager·SequenceCaptureManager 를 소유하고 켜고 끈다.
 *
 * null-safety.md — 캡처 실패/빈 이미지/권한 없음/GIF 0프레임을 명시 분기, skip 하되 로그.
 *
 * 타이밍(정직한 한계): seq.stop() 은 ffmpeg GIF 인코딩이라 수십~수백 ms 걸린다.
 *   인코딩이 끝나기 전 다음 클릭이 오면 seq.start() 내부의 GifManager.start() 가
 *   "이미 녹화 중" 으로 throw 한다(실측 확인 — gif.ts stop() 은 finally 에서야
 *   framesDir 을 null 로 만든다). 이를 막기 위해 클릭 처리 전체를 한 트랜잭션으로
 *   직렬화(busy 플래그)하고, 처리 중 들어온 클릭은 최신 1건만 pending 으로 보관해
 *   현재 트랜잭션 종료 후 이어서 처리한다. 더 오래된 pending 은 드롭하고 로그.
 *
 * 상태 변화를 외부(트레이/HUD)에 알리기 위해 onStateChange 콜백을 받는다.
 */

export type StepGuideState =
  | { kind: 'idle' } |
  { kind: 'recording'; stepCount: number };

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
  /** 'image'=정지 PNG(첫 스텝/실패 fallback), 'gif'=직전~현재 구간 애니메이션. */
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
  /** 구간 GIF 녹화기 — 첫 클릭 직후 start, 이후 클릭마다 stop→start 로 구간을 이어붙인다. */
  private seq = new SequenceCaptureManager();
  private steps: RawStep[] = [];
  /**
   * 클릭 처리 트랜잭션 진행 중 플래그. 한 클릭의 (캡처 or seq.stop 인코딩 + gif 스텝
   * 누적 + seq.start) 전체가 끝날 때까지 true. 이 동안 온 클릭은 pendingClick 으로
   * 미뤄 seq.start/stop 이 겹치지 않게 직렬화한다(GifManager 이중 start throw 방지).
   */
  private busy = false;
  /**
   * busy 중 도착한 최신 클릭 1건. 트랜잭션 종료 시 이어서 처리한다.
   * 2건 이상 밀리면 최신만 남기고 이전 것은 드롭(로그) — 인코딩보다 빠른 연타는
   * 어차피 사람이 구분하기 어려운 중간 상태라 최신 클릭 기준 구간이 가장 유용하다.
   */
  private pendingClick: ClickPoint | null = null;
  /**
   * 현재 진행 중인 구간 GIF 의 캡처 영역(구간을 시작한 클릭의 디스플레이 bounds, DIP).
   * 다음 클릭이 이 구간을 GIF 로 마감할 때:
   *   - GIF width/height = (width,height) × scaleFactor (screencapture 는 physical px).
   *   - 마감 클릭의 이미지 내 좌표 = (clickDip - (x,y)) × scaleFactor.
   * seq 가 녹화 중이 아니면 null.
   */
  private segmentRect:
    | { x: number; y: number; width: number; height: number; scaleFactor: number } |
    null = null;
  private callbacks: StepGuideCallbacks | null = null;
  /**
   * 세션 세대 카운터 — start() 마다 +1. 캡처/인코딩은 비동기라, 정지/새 세션 시작 후에
   * 늦게 resolve 된 결과가 새 세션의 steps 를 오염시키지 않도록 세대를 대조한다.
   */
  private sessionId = 0;
  /** 결과 GIF 의 fps. recorder 와 동일하게 misc.gifFps 사용(start 시 로드). */
  private gifFps = 10;

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
    this.busy = false;
    this.pendingClick = null;
    this.gifFps = loadMisc().gifFps;
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
        callbacks.onError(`클릭 감지 종료됨: ${detail}`);
        callbacks.onStateChange({ kind: 'idle' });
      },
    });

    callbacks.onStateChange({ kind: 'recording', stepCount: 0 });
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
    // 세대 증가 — 이 시점 이후 resolve 되는 in-flight 캡처/인코딩은 handleClick 에서 폐기된다.
    this.sessionId += 1;
    // 마지막 클릭 이후 진행 중이던 구간은 다음 클릭이 없어 완성 못 됨 → 버린다.
    // cancel 은 비동기(tmp 폴더 정리)지만 export 를 막을 이유가 없어 fire-and-forget.
    this.cancelSequenceIfRecording();
    this.pendingClick = null;
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
    this.cancelSequenceIfRecording(); // 진행 중 GIF 구간 폐기(tmp 폴더 정리).
    this.pendingClick = null;
    this.steps = [];
    this.callbacks?.onStateChange({ kind: 'idle' });
  }

  /** 진행 중인 구간 GIF 녹화를 취소(tmp 프레임 폐기). 녹화 중 아니면 no-op. */
  private cancelSequenceIfRecording(): void {
    if (!this.seq.isRecording()) return;
    // cancel 은 비동기(rm) 지만 종료 흐름을 막지 않도록 fire-and-forget + 에러 로깅.
    this.seq.cancel().catch((err: unknown) => {
      console.warn('[asis] stepGuide: 구간 GIF cancel 실패', err);
    });
  }

  /**
   * 클릭 한 번 처리 — 트랜잭션 직렬화 진입점.
   *
   * busy(=한 클릭의 캡처/인코딩/구간 재시작 전체) 중 도착한 클릭은 최신 1건만
   * pendingClick 으로 보관하고 즉시 반환한다. 현재 트랜잭션이 끝나면(runClickTx 의
   * finally) pendingClick 을 이어서 처리한다. 이렇게 seq.start/stop 을 겹치지 않게
   * 직렬화해 GifManager 이중 start throw(실측 확인)를 막는다.
   */
  private handleClick(point: ClickPoint): void {
    if (this.busy) {
      if (this.pendingClick) {
        // 인코딩보다 빠른 연타 — 최신 클릭만 남기고 이전 pending 은 드롭.
        console.warn('[asis] stepGuide: 인코딩 중 클릭 다중 도착 — 이전 pending 드롭');
      }
      this.pendingClick = point;
      return;
    }
    this.busy = true;
    // 이 트랜잭션이 속한 세션 — 완료 시점에 세션이 바뀌었으면 결과를 버린다.
    const session = this.sessionId;

    this.runClickTx(point, session).then(
      () => {
        this.busy = false;
        this.drainPending(session);
      },
      (err: unknown) => {
        this.busy = false;
        // 한 클릭 처리 실패가 전체 녹화를 죽이지 않게 — 로깅 후 계속.
        console.error('[asis] stepGuide: 클릭 처리 실패', err);
        this.drainPending(session);
      },
    );
  }

  /** 트랜잭션 종료 후 대기 중이던 클릭을 이어서 처리. */
  private drainPending(session: number): void {
    // 세션이 바뀌었으면(정지/재시작) 대기 클릭은 폐기.
    if (session !== this.sessionId) {
      this.pendingClick = null;
      return;
    }
    const next = this.pendingClick;
    if (!next) return;
    this.pendingClick = null;
    this.handleClick(next);
  }

  /**
   * 클릭 한 건의 전체 트랜잭션.
   *   - 첫 클릭  : 정지 PNG image 스텝 캡처 → 누적 → 다음 구간 GIF 녹화 start.
   *   - 이후 클릭: 진행 중 구간을 GIF 로 stop(인코딩) → gif 스텝 누적 → 다음 구간 start.
   * 세션 대조로 정지 후 늦게 끝난 결과의 steps 오염을 막는다.
   */
  private async runClickTx(point: ClickPoint, session: number): Promise<void> {
    const isFirst = this.steps.length === 0;
    const step = isFirst
      ? await this.captureImageStep(point)
      : await this.finalizeGifStep(point);

    // 캡처/인코딩 도중 정지·재시작됐으면 결과 폐기(steps 오염 방지).
    if (session !== this.sessionId) {
      // 이미 파일까지 만든 gif 스텝이 버려지면 tmp GIF 가 고아가 되므로 여기서 정리.
      // (image 스텝의 tmp PNG 는 기존 코드처럼 OS tmp 정리에 맡긴다.)
      if (step?.kind === 'gif') {
        unlink(step.imagePath).catch((err: unknown) => {
          if (!isEnoent(err)) {
            console.warn('[asis] stepGuide: 고아 tmp GIF 정리 실패', step.imagePath, err);
          }
        });
      }
      return;
    }

    if (step) {
      this.steps.push(step);
      this.callbacks?.onStateChange({
        kind: 'recording',
        stepCount: this.steps.length,
      });
    }

    // 다음 구간 GIF 녹화 시작. 세션이 유효할 때만(정지 후 새 구간 생성 방지).
    // seq 가 이미 녹화 중이면(finalizeGifStep 이 stop 안 했거나 예외 상황) 먼저 정리.
    if (session !== this.sessionId) return;
    await this.startNextSegment(point);
  }

  /**
   * 첫 클릭 — 커서 디스플레이 전체의 정지 PNG 를 image 스텝으로 캡처.
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
   * 이후 클릭 — 진행 중이던 구간을 GIF 로 마감한다.
   *   1) AX 라벨은 (화면이 바뀌기 전) *현재 클릭 기준* 으로 먼저 조회.
   *   2) seq.stop(tmpGif) 로 인코딩 → GIF 경로. (0프레임 등 실패 시 null 반환·로그.)
   *   3) GIF 파일을 base64 로 읽어 dataURL 생성(HTML 임베드용 — 애니메이션 유지).
   * width/height 는 구간 시작 시 저장한 segmentRect(× scaleFactor)로 계산한다.
   * clickX/clickY/label 은 현재 클릭 기준.
   */
  private async finalizeGifStep(point: ClickPoint): Promise<RawStep | null> {
    // seq 가 녹화 중이 아니면(이전 구간 시작 실패 등) GIF 로 마감할 게 없다.
    // 이 경우 정지 이미지로 폴백해 스텝을 잃지 않는다.
    if (!this.seq.isRecording() || !this.segmentRect) {
      console.warn('[asis] stepGuide: 진행 중 구간 없음 — 정지 이미지로 폴백');
      return this.captureImageStep(point);
    }
    const seg = this.segmentRect;

    // 라벨은 인코딩(수백 ms) *전에* 조회 — 인코딩 후엔 화면이 바뀌었을 수 있음.
    const element = getElementBoundsAtPoint(point.x, point.y);
    const label = element?.name;

    const tmpGif = this.tmpGifPath();
    let gifPath: string;
    try {
      gifPath = await this.seq.stop(tmpGif);
    } catch (err) {
      // 인코딩 실패(0프레임/ffmpeg 오류 등) — 이 구간은 잃지만 녹화는 계속.
      // segmentRect 를 비워 다음 startNextSegment 가 새로 시작하게 한다.
      this.segmentRect = null;
      console.error('[asis] stepGuide: 구간 GIF 인코딩 실패', err);
      return null;
    }
    // stop 성공 시 seq 는 idle. 이 구간은 소비됐으므로 rect 도 비운다.
    this.segmentRect = null;

    const buf = await readFile(gifPath);
    if (buf.length === 0) {
      console.warn('[asis] stepGuide: GIF 파일이 비어 있음', gifPath);
      return null;
    }
    // GIF 는 nativeImage.toDataURL 이 첫 프레임만 담을 수 있어(애니메이션 소실),
    // 파일 바이트를 직접 base64 dataURL 로 만든다(실측: HTML <img> 에서 애니메이션 유지).
    const imageDataUrl = `data:image/gif;base64,${buf.toString('base64')}`;

    // GIF 픽셀 크기 = 구간 시작 디스플레이 bounds × scaleFactor(screencapture 는 physical px).
    const width = Math.round(seg.width * seg.scaleFactor);
    const height = Math.round(seg.height * seg.scaleFactor);
    // 마감 클릭의 이미지 내 좌표 — 구간 시작 디스플레이 원점 기준으로 환산.
    // (gif 는 마커를 안 그리지만, AX 라벨이 없을 때 caption 좌표 표기에 쓰인다.)
    const clickX = Math.round((point.x - seg.x) * seg.scaleFactor);
    const clickY = Math.round((point.y - seg.y) * seg.scaleFactor);

    const order = this.steps.length + 1;
    return {
      order,
      kind: 'gif',
      imagePath: gifPath,
      imageDataUrl,
      width,
      height,
      clickX,
      clickY,
      timestamp: Date.now(),
      label,
    };
  }

  /**
   * 다음 구간 GIF 녹화를 시작한다 — point 가 속한 디스플레이 전체를 대상으로.
   * 시작 실패 시 segmentRect 를 비우고 로그(다음 클릭은 정지 이미지로 폴백).
   * 방어적으로: 혹시 seq 가 아직 녹화 중이면(선행 stop 누락) 먼저 cancel.
   */
  private async startNextSegment(point: ClickPoint): Promise<void> {
    const display = screen.getDisplayNearestPoint({ x: point.x, y: point.y });
    const b = display.bounds;
    const sf = display.scaleFactor || 1;

    if (this.seq.isRecording()) {
      // 정상 흐름에선 도달 안 함(finalizeGifStep 이 stop 했음). 방어적 정리.
      await this.seq.cancel().catch((err: unknown) => {
        console.warn('[asis] stepGuide: startNextSegment 선행 cancel 실패', err);
      });
    }

    try {
      await this.seq.start({
        rect: { x: b.x, y: b.y, w: b.width, h: b.height },
        fps: this.gifFps,
      });
      // 시작 성공 후에만 rect 저장 — 다음 클릭이 이 값으로 GIF 크기/좌표를 계산.
      this.segmentRect = {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        scaleFactor: sf,
      };
    } catch (err) {
      this.segmentRect = null;
      console.error('[asis] stepGuide: 구간 GIF 시작 실패', err);
    }
  }

  /** 구간 GIF 임시 파일 경로 — 클릭마다 생성되므로 pid+시각+세대로 충돌 방지. */
  private tmpGifPath(): string {
    return join(
      tmpdir(),
      `asis-stepguide-${process.pid}-${Date.now()}-${this.sessionId}.gif`,
    );
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
      title: '가이드 저장',
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
    title: `ASIS 가이드 (${steps.length}단계)`,
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
