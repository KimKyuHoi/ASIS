import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, clipboard, dialog } from 'electron';
import { is } from '@electron-toolkit/utils';
import {
  convertImageToFile,
  convertNativeImage,
  DEFAULT_JPEG_QUALITY,
  type ImageFormat,
} from './imageConvert';

/**
 * 이미지 포맷·압축 변환 *흐름* — guardCapture → 영역 선택 → 캡처 → 변환 → 저장.
 *
 * handleOcr / handleQr (src/main/index.ts) 와 동일한 골격을 따른다:
 *   guardCapture().then(ok) → selectionOverlay.show()
 *     → setTimeout(overlayCloseDelayMs) → captureRegion(rect)
 *     → 변환 → showSaveDialog → writeFile → tmp cleanup
 *
 * index.ts 의 private 헬퍼(notify*, OVERLAY_CLOSE_DELAY_MS, selectionOverlay 등)를
 * 이 모듈에서 직접 건드리지 않기 위해, 필요한 의존성을 인자로 주입받는다
 * (deps). 통합자는 index.ts 에서 이 함수를 한 번 호출해 배선한다 — 공통 배선
 * 파일을 수정하지 않고 신규 파일로 기능을 완결한다.
 *
 * 룰
 *   - imperative-style.md — main process 흐름, 명령형/Promise 체이닝 OK.
 *   - null-safety.md — 캡처 실패/빈 이미지/다이얼로그 취소를 명시 분기하고,
 *     성공·실패·취소 어느 경로에서도 tmp PNG 를 반드시 unlink 한다.
 */

/** selectionOverlay.show() 가 돌려주는 값의 구조적 계약(필요한 부분만). */
type SelectionResult =
  | {
    kind: 'selected';
    rect: { x: number; y: number; w: number; h: number; windowId?: number };
  } |
  { kind: 'canceled' };

/** captureRegion 결과의 구조적 계약(capture/capture.ts CaptureResult 와 동일 형태). */
type CaptureResult =
  | { kind: 'success'; path: string } |
  { kind: 'canceled' };

/**
 * 흐름이 필요로 하는 외부 의존성. index.ts 가 자신의 인스턴스/헬퍼를 넘긴다.
 * (테스트 시에는 가짜 구현을 주입해 React/Electron 없이 흐름을 검증할 수 있다.)
 */
export type ImageConvertDeps = {
  /** 화면 녹화 권한 게이트 — false 면 즉시 중단. (permissions.guardCapture) */
  guardCapture: () => Promise<boolean>;
  /** 영역 선택 오버레이. (windows/selectionOverlay 의 show) */
  showSelectionOverlay: () => Promise<SelectionResult>;
  /** 영역 캡처 → 임시 PNG. (capture/capture 의 captureRegion) */
  captureRegion: (rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  }) => Promise<CaptureResult>;
  /** 정보 알림. (index.ts notifyInfo) */
  notifyInfo: (body: string) => void;
  /** 오류 알림. (index.ts notifyError) */
  notifyError: (body: string) => void;
  /**
   * overlay close 후 compositor dim 잔상이 캡처에 안 들어가도록 하는 지연(ms).
   * index.ts 의 OVERLAY_CLOSE_DELAY_MS 를 그대로 넘긴다.
   */
  overlayCloseDelayMs: number;
};

/** 변환 옵션 — 포맷/품질. 미지정 시 JPG quality 80. */
export type ImageConvertOptions = {
  format?: ImageFormat;
  /** JPEG quality (0~100 정수). png 포맷에서는 무시. */
  quality?: number;
};

/** 포맷별 저장 다이얼로그 필터. */
function saveFilter(ext: 'jpg' | 'png'): { name: string; extensions: string[] } {
  if (ext === 'jpg') {
    return { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] };
  }
  return { name: 'PNG Image', extensions: ['png'] };
}

/** 임시 PNG 정리 — 실패해도 흐름을 막지 않고 경고만 남긴다(핸들 누수 방지). */
function cleanupTmp(path: string): void {
  unlink(path).catch((e: unknown) => {
    if (is.dev) console.warn('[asis] image-convert tmp cleanup failed', e);
  });
}

/**
 * 변환 흐름 실행. 단축키/트레이 핸들러에서 이 함수를 호출하면 된다.
 *
 * @param deps    외부 의존성(주입).
 * @param options 포맷/품질. 기본 JPG quality 80.
 */
export function runImageConvert(
  deps: ImageConvertDeps,
  options: ImageConvertOptions = {},
): void {
  const format: ImageFormat = options.format ?? 'jpeg';
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;

  deps.guardCapture().then((ok) => {
    if (!ok) return;
    deps.showSelectionOverlay().then(
      (result) => {
        if (result.kind !== 'selected') return;
        const r = result.rect;
        const rect = { x: r.x, y: r.y, w: r.w, h: r.h };
        // overlay close 후 dim 잔상 회피 — OCR/QR 와 동일하게 지연 후 캡처.
        setTimeout(() => {
          deps.captureRegion(rect).then(
            (cap) => {
              if (cap.kind !== 'success') return;
              handleCaptured(deps, cap.path, format, quality);
            },
            (err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              console.error('[asis] 이미지 변환 캡처 실패', err);
              deps.notifyError(`이미지 변환 실패: ${message}`);
            },
          );
        }, deps.overlayCloseDelayMs);
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[asis] 이미지 변환 영역 선택 실패', err);
        deps.notifyError(`이미지 변환 실패: ${message}`);
      },
    );
  });
}

/**
 * 캡처된 PNG 를 변환·저장한다. 성공/취소/빈이미지/오류 어느 경로에서도
 * tmp PNG 를 정리한다.
 */
function handleCaptured(
  deps: ImageConvertDeps,
  pngPath: string,
  format: ImageFormat,
  quality: number,
): void {
  const ext: 'jpg' | 'png' = format === 'png' ? 'png' : 'jpg';
  const defaultPath = join(
    app.getPath('pictures'),
    `ASIS-${Date.now()}.${ext}`,
  );

  dialog
    .showSaveDialog({
      defaultPath,
      filters: [saveFilter(ext)],
    })
    .then(
      (saved) => {
        // 취소 — 저장 안 함. tmp PNG 는 반드시 정리 (index.ts TimeMachine 저장과
        // 동일하게 '취소 시에도 unlink'). OCR/QR 흐름엔 이 취소 케이스가 없었다.
        if (saved.canceled || !saved.filePath) {
          cleanupTmp(pngPath);
          return;
        }
        convertImageToFile(pngPath, saved.filePath, format, quality).then(
          (conv) => {
            cleanupTmp(pngPath);
            if (conv.kind === 'empty') {
              // createFromPath 가 빈 이미지 반환 — 조용히 넘기지 않고 안내.
              deps.notifyError('이미지 변환 실패 — 캡처 이미지를 읽지 못했습니다');
              return;
            }
            deps.notifyInfo(
              `이미지를 ${ext.toUpperCase()} 로 저장했습니다 — ${saved.filePath}`,
            );
          },
          (err: unknown) => {
            cleanupTmp(pngPath);
            const message = err instanceof Error ? err.message : String(err);
            console.error('[asis] 이미지 변환/저장 실패', err);
            deps.notifyError(`이미지 변환 실패: ${message}`);
          },
        );
      },
      (err: unknown) => {
        cleanupTmp(pngPath);
        const message = err instanceof Error ? err.message : String(err);
        console.error('[asis] 저장 다이얼로그 실패', err);
        deps.notifyError(`이미지 변환 실패: ${message}`);
      },
    );
}

/**
 * 클립보드 이미지를 변환·저장하는 흐름 — 영역 선택/캡처 없이 바로 저장.
 * handleClipboardPin (index.ts) 처럼 클립보드 이미지를 소스로 쓴다.
 *
 * 캡처 경로와 달리 tmp PNG 가 없다(클립보드 이미지는 인메모리). guardCapture 도
 * 불필요하다 — 화면을 새로 캡처하지 않기 때문. deps 중 notify* 만 사용한다.
 */
export function runClipboardImageConvert(
  deps: Pick<ImageConvertDeps, 'notifyInfo' | 'notifyError'>,
  options: ImageConvertOptions = {},
): void {
  const format: ImageFormat = options.format ?? 'jpeg';
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;

  const image = clipboard.readImage();
  if (image.isEmpty()) {
    deps.notifyInfo('클립보드에 이미지가 없습니다');
    return;
  }

  const conv = convertNativeImage(image, format, quality);
  if (conv.kind === 'empty') {
    // isEmpty() 를 위에서 통과했는데 여기서 empty 면 예상 밖 — 조용히 넘기지 않는다.
    deps.notifyError('이미지 변환 실패 — 클립보드 이미지를 읽지 못했습니다');
    return;
  }

  const defaultPath = join(
    app.getPath('pictures'),
    `ASIS-${Date.now()}.${conv.ext}`,
  );
  dialog
    .showSaveDialog({
      defaultPath,
      filters: [saveFilter(conv.ext)],
    })
    .then(
      (saved) => {
        if (saved.canceled || !saved.filePath) return;
        const filePath = saved.filePath;
        writeFile(filePath, conv.buffer).then(
          () => {
            deps.notifyInfo(
              `클립보드 이미지를 ${conv.ext.toUpperCase()} 로 저장했습니다 — ${filePath}`,
            );
          },
          (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[asis] 클립보드 이미지 저장 실패', err);
            deps.notifyError(`이미지 변환 실패: ${message}`);
          },
        );
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[asis] 저장 다이얼로그 실패', err);
        deps.notifyError(`이미지 변환 실패: ${message}`);
      },
    );
}
