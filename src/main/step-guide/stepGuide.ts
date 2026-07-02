import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app, dialog, nativeImage, screen } from 'electron';
import { captureRegion } from '../capture/capture';
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
} from './stepGuideExport';

/**
 * 스텝바이스텝 가이드 생성기 오케스트레이터.
 *
 * 흐름:
 *   1. start() — ClickMonitorManager 로 전역 클릭 감지 시작.
 *   2. 클릭마다 → 커서가 있는 디스플레이 전체를 캡처(screencapture) + 클릭 지점의
 *      AX 요소 이름 조회 → 스텝 하나로 누적. 캡처 중 발생한 클릭은 무시(재진입 방지).
 *   3. stop() — 감지 중지 후 Markdown/HTML 문서로 export(저장 다이얼로그).
 *
 * side-effects.md Rule 3 — 전역 클릭 탭 + 캡처 파이프라인은 React 무관 lifecycle →
 * 모듈 스코프 Class. ClickMonitorManager 를 소유하고 start/stop 으로 켜고 끈다.
 *
 * null-safety.md — 캡처 실패/빈 이미지/권한 없음을 명시 분기, silent skip 하되 로그.
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
  private steps: RawStep[] = [];
  /** 캡처 진행 중 플래그 — 캡처 자체가 유발하는 부수 클릭/중복 방지(재진입 차단). */
  private capturing = false;
  private callbacks: StepGuideCallbacks | null = null;
  /**
   * 세션 세대 카운터 — start() 마다 +1. 캡처는 비동기라, 정지/새 세션 시작 후에
   * 늦게 resolve 된 캡처가 새 세션의 steps 를 오염시키지 않도록 세대를 대조한다.
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
    this.capturing = false;
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
    // 세대 증가 — 이 시점 이후 resolve 되는 in-flight 캡처는 handleClick 에서 폐기된다.
    this.sessionId += 1;
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
    this.sessionId += 1; // in-flight 캡처 폐기.
    this.steps = [];
    this.callbacks?.onStateChange({ kind: 'idle' });
  }

  /** 클릭 한 번 처리 — 디스플레이 캡처 + AX 라벨 + 스텝 누적. */
  private handleClick(point: ClickPoint): void {
    // 재진입 방지: 이전 캡처가 아직 진행 중이면 이 클릭은 건너뛴다.
    // (캡처 완료 전 빠른 연속 클릭은 스텝을 잃지만, 캡처가 겹쳐 파일이 꼬이는 것보다 안전.)
    if (this.capturing) return;
    this.capturing = true;
    // 이 캡처가 속한 세션 — resolve 시점에 세션이 바뀌었으면 결과를 버린다.
    const session = this.sessionId;

    this.captureStep(point).then(
      (step) => {
        this.capturing = false;
        // 정지/새 세션 후 늦게 도착한 캡처 — steps 오염 방지 위해 폐기.
        if (session !== this.sessionId) return;
        if (!step) return; // 캡처 취소/실패 — captureStep 내부에서 로깅.
        this.steps.push(step);
        this.callbacks?.onStateChange({
          kind: 'recording',
          stepCount: this.steps.length,
        });
      },
      (err: unknown) => {
        this.capturing = false;
        // 한 스텝 캡처 실패가 전체 녹화를 죽이지 않게 — 로깅 후 계속.
        console.error('[asis] stepGuide: 스텝 캡처 실패', err);
      },
    );
  }

  /**
   * 클릭 지점을 스텝으로 캡처.
   *   - 커서가 있는 디스플레이 전체를 screencapture -R 로 캡처(physical px).
   *   - 클릭의 이미지 내 픽셀 좌표 = (clickDip - displayOrigin) * scaleFactor.
   *   - AX 요소 이름 조회(권한 있으면). 실패 시 라벨 없이 진행.
   * 캡처 취소/빈 이미지면 null 반환(스텝 미기록).
   */
  private async captureStep(point: ClickPoint): Promise<RawStep | null> {
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
      // Markdown 은 이미지를 상대 경로 참조 → 문서와 같은 폴더에 step-NN.png 저장.
      const outDir = dirname(outPath);
      const fileNames = guide.steps.map((s) => stepImageFileName(s.order));
      // 이미지들을 병렬로 쓴다. no-await-in-loop 룰 준수 위해 Promise.all.
      await Promise.all(
        guide.steps.map((step, i) =>
          writeStepImage(join(outDir, fileNames[i]), step.imageDataUrl),
        ),
      );
      const md = toMarkdown(guide, fileNames);
      await writeFile(outPath, md, 'utf8');
    } else {
      // HTML 은 data URL 임베드 → 단일 파일.
      const html = toHtml(guide);
      await writeFile(outPath, html, 'utf8');
    }

    callbacks.onExported({ kind: 'saved', path: outPath });
  }
}

/** RawStep[] → export 용 Guide. 제목은 첫 스텝 시각 기준. */
function buildGuide(rawSteps: RawStep[]): Guide {
  const createdAt = Date.now();
  const steps: GuideStep[] = rawSteps.map((r) => ({
    order: r.order,
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

/** data URL(PNG)을 파일로 저장 — Markdown export 의 상대 이미지 쓰기. */
async function writeStepImage(path: string, dataUrl: string): Promise<void> {
  // nativeImage 로 재인코딩하면 손실 없이 PNG 버퍼를 얻는다(원본이 PNG data URL).
  const img = nativeImage.createFromDataURL(dataUrl);
  if (img.isEmpty()) {
    throw new Error(`가이드 이미지 저장 실패(빈 이미지): ${path}`);
  }
  await writeFile(path, img.toPNG());
}
