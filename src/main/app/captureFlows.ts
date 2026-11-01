import { clipboard, nativeImage, screen } from 'electron';
import { unlink } from 'node:fs/promises';
import log from 'electron-log/main';
import {
  captureAllDisplays,
  captureDisplays,
  captureRegion,
  captureWindowById,
  type CaptureResult,
} from '../capture/capture';
import type { EditorResult } from '../windows/editorWindow';
import type { Rect as SelectionRect } from '../windows/selectionSession';
import { loadMisc } from '../settings';
import { guardCapture } from '../permissions';
import { UserFacingError, userMessageOf } from '../userFacingError';
import { tMain } from '../i18n/strings';
import {
  countdownWindow,
  editorWindow,
  pinWindow,
  runningFeatures,
  selectionOverlay,
} from './managers';
import { notifyError, notifyInfo } from './notify';

/**
 * 이미지 캡처 흐름 — 영역 선택 → 캡처 → 에디터(또는 바로 복사).
 * 녹화 흐름과 공유하는 가드(whenCaptureAllowed·rejectIfRunning·rejectIfRecording)도 여기 둔다.
 */

/**
 * overlay 의 BrowserWindow close 후 macOS compositor 가 dim 픽셀을 화면에서
 * 완전히 제거할 때까지 대기. 캡처 결과에 검은/흰 잔상이 남지 않도록 한다.
 * 200ms 면 NSPanel close + Space 재합성까지 안전 (사용자 인지 어려운 지연).
 */
const OVERLAY_CLOSE_DELAY_MS = 200;

/** 캡처 파일을 에디터로 연다 — 파일은 에디터가 닫힐 때 지운다. */
const openEditor = (label: string, path: string): void => {
  editorWindow.show(path).then(
    (editorResult) => {
      if (editorResult.kind === 'copied') {
        notifyInfo(tMain().capture.copiedToClipboard(label));
      }
    },
    (err: unknown) => {
      const message = userMessageOf(err);
      console.error(`[asis] ${label} 에디터 실패`, err);
      notifyError(tMain().capture.editorFailed(label, message));
    },
  );
};

type EditorOpenTexts = { label: string; openFailed: (message: string) => string };

/**
 * 캡처가 아닌 출처(히스토리 편집본·이미지 파일)로 에디터를 연다.
 * 읽기·검증 실패는 알림(사전 문구) + 로그(원인 원문 — UserFacingError.detail).
 */
export const openInEditor = (
  open: () => Promise<EditorResult>,
  texts: () => EditorOpenTexts,
): void => {
  open().then(
    (editorResult) => {
      if (editorResult.kind === 'copied') {
        notifyInfo(tMain().capture.copiedToClipboard(texts().label));
      }
    },
    (err: unknown) => {
      const detail = err instanceof UserFacingError ? err.detail : undefined;
      log.error('[asis] 에디터 열기 실패', detail ?? '', err);
      notifyError(texts().openFailed(userMessageOf(err)));
    },
  );
};

/** 이미지 스튜디오 — 기존 이미지 파일을 에디터로 연다 (원본 파일은 읽기만). */
export const openImageStudio = (path: string): void => {
  openInEditor(() => editorWindow.showImageFile(path), () => tMain().imageStudio);
};

/** 바로 복사 — 에디터를 띄우지 않고 클립보드에 복사한다. */
function copyCaptureToClipboard(label: string, path: string): void {
  const image = nativeImage.createFromPath(path);
  // 이미지가 메모리에 올라왔으니 캡처 tmp 는 더 쓸 데가 없다 — 에디터 경로는 endSession 이 지운다.
  unlink(path).catch((e: unknown) => console.warn('[asis] capture tmp cleanup failed', e));
  if (image.isEmpty()) {
    notifyError(tMain().capture.imageReadFailed(label));
    return;
  }
  clipboard.writeImage(image);
  notifyInfo(tMain().capture.copiedToClipboard(label));
}

/**
 * 캡처 → 에디터 → 클립보드 흐름 (권한 체크 없음 — 호출 전 체크 완료 가정).
 * 캡처 완료음은 screencapture 의 네이티브 셔터음이 캡처 시점에 재생한다(capture.ts soundArgs).
 */
export const runCapture = (label: string, capture: () => Promise<CaptureResult>): void => {
  capture().then(
    (result) => {
      if (result.kind !== 'success') return;
      if (loadMisc().afterCapture === 'clipboard') {
        copyCaptureToClipboard(label, result.path);
        return;
      }
      openEditor(label, result.path);
    },
    (err: unknown) => {
      const message = userMessageOf(err);
      console.error(`[asis] ${label} 실패`, err);
      notifyError(tMain().capture.failed(label, message));
    },
  );
};

/**
 * 전체화면 캡처 — 설정에 따라 커서가 있는 화면 하나, 또는 연결된 모든 화면을 실제 배치대로 합친다.
 */
export const captureFullscreenByScope = (): Promise<CaptureResult> => {
  if (loadMisc().fullscreenScope === 'all') return captureAllDisplays();
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return captureDisplays([cursorDisplay.id]);
};

/**
 * 화면 기록 권한이 있을 때만 run 을 실행한다. 권한이 없으면 guardCapture 가 안내를 띄운다.
 * 권한 조회 자체가 실패하는 일은 예상 밖이라 로그로 남긴다 (사용자 동작은 그냥 무시된다).
 */
export function whenCaptureAllowed(run: () => void): void {
  guardCapture().then(
    (ok) => {
      if (ok) run();
    },
    (err: unknown) => {
      log.error('[asis] 화면 기록 권한 확인 실패', err);
    },
  );
}

/** 캡처 → 에디터 → 클립보드 흐름 (권한 체크 포함). */
export const handleCapture = (label: string, capture: () => Promise<CaptureResult>): void => {
  whenCaptureAllowed(() => {
    runCapture(label, capture);
  });
};

/**
 * 선택한 영역/창을 캡처한다. Dock 아이템은 가짜 음수 ID 라 screencapture -l 가 invalid 처리하므로
 * rect 기반 captureRegion 으로 찍는다. 일반 윈도우(양수 ID)는 그 창만 찍는다.
 */
function captureSelection(selected: SelectionRect): Promise<CaptureResult> {
  const { windowId, ...rect } = selected;
  return windowId !== undefined && windowId > 0 ? captureWindowById(windowId) : captureRegion(rect);
}

function notifyRegionSelectFailed(err: unknown, logLabel: string): void {
  console.error(`[asis] ${logLabel}`, err);
  notifyError(tMain().capture.regionSelectFailed(userMessageOf(err)));
}

export const handleRegionCapture = (): void => {
  if (rejectIfRunning()) return;
  whenCaptureAllowed(() => {
    selectionOverlay.show().then(
      (result) => {
        if (result.kind !== 'selected') return;
        const capture = (): Promise<CaptureResult> => captureSelection(result.rect);
        // overlay close 후 macOS compositor 의 dim 잔상이 캡처에 들어가지
        // 않도록 OVERLAY_CLOSE_DELAY_MS 대기 후 screencapture 실행.
        setTimeout(() => {
          handleCapture(tMain().capture.labelRegion, capture);
        }, OVERLAY_CLOSE_DELAY_MS);
      },
      (err: unknown) => notifyRegionSelectFailed(err, '영역 선택 오버레이 실패'),
    );
  });
};

/** 지연 캡처 카운트다운 — 끝나면 capture 를 실행한다. */
function afterCountdown(run: () => void): void {
  const delayMs = loadMisc().delayedCaptureSeconds * 1000;
  countdownWindow.show(delayMs / 1000, screen.getCursorScreenPoint());
  setTimeout(() => {
    countdownWindow.close();
    run();
  }, delayMs);
}

/** 지연 전체화면 캡처 — 호버 상태 캡처용. */
export const handleDelayedFullscreen = (): void => {
  whenCaptureAllowed(() => {
    afterCountdown(() => runCapture(tMain().capture.labelFullscreen, captureFullscreenByScope));
  });
};

/** 지연 영역 캡처 — 영역은 먼저 선택, 그 후 카운트다운 뒤 캡처. */
export const handleDelayedRegion = (): void => {
  if (rejectIfRunning()) return;
  whenCaptureAllowed(() => {
    selectionOverlay.show().then(
      (result) => {
        if (result.kind !== 'selected') return;
        const capture = (): Promise<CaptureResult> => captureSelection(result.rect);
        afterCountdown(() => runCapture(tMain().capture.labelRegion, capture));
      },
      (err: unknown) => notifyRegionSelectFailed(err, '지연 영역 선택 실패'),
    );
  });
};

/**
 * 클립보드 이미지를 *바로 Pin* (Snipaste F3).
 * 클립보드가 빈 이미지면 알림으로 안내.
 */
export const handleClipboardPin = (): void => {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    notifyInfo(tMain().pin.empty);
    return;
  }
  const { width, height } = image.getSize();
  pinWindow.pin(image.toDataURL(), width, height);
};

/**
 * 녹화가 진행 중이면 막는다(영역 캡처·새 녹화 공통).
 *  - 녹화 영역 테두리·전역 ESC 는 기능마다 따로 켜고 끄므로 동시에 돌면 먼저 끝난 쪽이 다른
 *    녹화의 테두리·ESC 를 지운다.
 *  - 녹화 중에 선택 오버레이를 열면 어두운 배경이 녹화본에 찍히고, ESC 가 선택이 아니라
 *    녹화를 취소한다.
 * @returns 막았으면 true
 */
export const rejectIfRunning = (): boolean => {
  const running = runningFeatures();
  if (running.length === 0) return false;
  const names = running.map((feature) => tMain().tray.recordingNames[feature]).join(', ');
  notifyInfo(tMain().recording.busy(names));
  return true;
};

/**
 * 새 녹화 시작 전 검사 — 진행 중인 녹화 + 영역 선택 중(GIF·영상의 "준비 중" 단계).
 * 선택 단계에서는 아직 runningFeatures() 에 잡히지 않아, 그 사이 다른 녹화가 끼어들 수 있다.
 */
export const rejectIfRecording = (): boolean => {
  if (rejectIfRunning()) return true;
  if (!selectionOverlay.isSelecting()) return false;
  notifyInfo(tMain().recording.selecting);
  return true;
};
