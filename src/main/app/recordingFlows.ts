import log from 'electron-log/main';
import { loadMisc } from '../settings';
import { warmAvfoundationIndices } from '../video/avfoundation';
import { recordingRegionOverlay } from '../windows/recordingRegionOverlay';
import { inputHighlight } from '../input-highlight/inputHighlight';
import { openPermissionSettings } from '../permissions';
import { tScroll } from '../scroll-capture/strings';
import { userMessageOf } from '../userFacingError';
import { tMain } from '../i18n/strings';
import {
  recorderWindow,
  scrollCaptureWindow,
  selectionOverlay,
  stepGuideWindow,
  trayManager,
  videoRecorderWindow,
} from './managers';
import { rejectIfRecording, whenCaptureAllowed } from './captureFlows';
import { openInGifStudio } from './fileOpen';
import { notifyError, notifyInfo } from './notify';

/**
 * 녹화 흐름 — GIF·화면 녹화·스크롤 캡처·스텝 가이드.
 * 각 단축키는 "실행 중이면 정지" 토글이다 — 알약이 안 보이는 경우의 회수 경로이기도 하다.
 */

type RecordRect = { x: number; y: number; w: number; h: number };

/** 녹화 중 클릭 링·단축키 배지 표시 — 둘 다 꺼져 있으면 아무것도 안 한다. 실패해도 녹화는 계속된다. */
function startInputHighlight(rect: RecordRect): void {
  const misc = loadMisc();
  inputHighlight.start(
    rect,
    { clicks: misc.recordShowClicks, keys: misc.recordShowKeys },
    { onWarning: notifyError },
  );
}

/**
 * 녹화 시작 직후 공통 처리 — 영역 테두리·입력 표시를 켜고 메뉴바 인디케이터를 갱신한다.
 * 녹화가 끝나면(성공·실패 모두) 다시 끈다. 실패 알림은 호출 쪽 then 이 맡는다.
 */
function trackRecording(rect: RecordRect, done: Promise<unknown>): void {
  // 녹화 중인 영역을 화면에 표시 — 테두리는 rect 바깥에만 그려져 프레임에 안 찍힌다.
  recordingRegionOverlay.show(rect);
  startInputHighlight(rect);
  // 메뉴바 ● 인디케이터·트레이 정지 항목 반영.
  trayManager.refresh();
  // 실패는 호출 쪽 then 의 실패 핸들러가 알린다 — 정리 체인에서는 삼키기만 한다.
  done
    .finally(() => {
      recordingRegionOverlay.hide();
      inputHighlight.stop();
      trayManager.refresh();
    })
    .catch(() => undefined);
}

/** 영역 선택 → onSelected. 선택 오버레이 자체 실패는 startFailed 문구로 알린다. */
function selectRegionThen(
  onSelected: (rect: RecordRect) => void,
  startFailed: (message: string) => string,
): void {
  selectionOverlay.show().then(
    (selResult) => {
      if (selResult.kind !== 'selected') return;
      // 창을 선택해도 그 창의 rect 를 녹화한다(창 이동 미추적).
      const r = selResult.rect;
      onSelected({ x: r.x, y: r.y, w: r.w, h: r.h });
    },
    (err: unknown) => {
      console.error('[asis] 녹화 영역 선택 실패', err);
      notifyError(startFailed(userMessageOf(err)));
    },
  );
}

function startGifRecording(rect: RecordRect): void {
  const showPromise = recorderWindow.show(rect, { after: loadMisc().gifAfterRecord });
  trackRecording(rect, showPromise);
  if (recorderWindow.isHidden()) notifyInfo(tMain().gif.recording);
  showPromise.then(
    (recResult) => {
      if (recResult.kind === 'saved') {
        notifyInfo(tMain().gif.saved(recResult.path));
      } else if (recResult.kind === 'copied') {
        notifyInfo(tMain().gif.copied);
      } else if (recResult.kind === 'encoded') {
        // tmp GIF 정리 책임은 스튜디오 창으로 넘어간다(deleteOnClose).
        openInGifStudio({ kind: 'gif', path: recResult.path, deleteOnClose: true });
      } else if (recResult.kind === 'failed') {
        log.error('[asis] GIF 인코딩 실패', recResult.error);
        notifyError(tMain().gif.encodeFailed(userMessageOf(recResult.error)));
      }
    },
    (err: unknown) => {
      console.error('[asis] recorder failed', err);
      notifyError(tMain().gif.recordFailed(userMessageOf(err)));
    },
  );
}

export const handleGif = (): void => {
  if (recorderWindow.isActive()) {
    notifyInfo(tMain().gif.encoding);
    recorderWindow.triggerStop();
    return;
  }
  if (rejectIfRecording()) return;
  whenCaptureAllowed(() => {
    selectRegionThen(startGifRecording, tMain().gif.startFailed);
  });
};

function startVideoRecording(rect: RecordRect): void {
  const showPromise = videoRecorderWindow.show(rect);
  trackRecording(rect, showPromise);
  if (videoRecorderWindow.isHidden()) notifyInfo(tMain().video.recording);
  showPromise.then(
    (recResult) => {
      if (recResult.kind === 'saved') {
        notifyInfo(tMain().video.saved(recResult.path));
      } else if (recResult.kind === 'failed') {
        log.error('[asis] 화면 녹화 실패', recResult.error);
        notifyError(tMain().video.failed(userMessageOf(recResult.error)));
      }
    },
    (err: unknown) => {
      console.error('[asis] video recorder failed', err);
      notifyError(tMain().video.failed(userMessageOf(err)));
    },
  );
}

export const handleVideo = (): void => {
  if (videoRecorderWindow.isActive()) {
    notifyInfo(tMain().video.stopping);
    videoRecorderWindow.triggerStop();
    return;
  }
  if (rejectIfRecording()) return;
  whenCaptureAllowed(() => {
    // 사용자가 영역을 고르는 동안 ffmpeg 장치 열거를 미리 끝내 둔다 —
    // 선택 완료 → 녹화 시작 사이의 -list_devices spawn(수백 ms) 제거.
    warmAvfoundationIndices();
    selectRegionThen(startVideoRecording, tMain().video.startFailed);
  });
};

function startScrollCapture(rect: RecordRect): void {
  const showPromise = scrollCaptureWindow.show(rect);
  trayManager.refresh();
  // 실패는 아래 then 의 실패 핸들러가 알린다 — 정리 체인에서는 삼키기만 한다.
  showPromise.finally(() => trayManager.refresh()).catch(() => undefined);
  if (scrollCaptureWindow.isHidden()) notifyInfo(tMain().scroll.recording);
  showPromise.then(
    (res) => {
      if (res.kind === 'saved' || res.kind === 'copied') {
        notifyInfo(res.kind === 'saved' ? tMain().scroll.saved(res.path) : tMain().scroll.copied);
        // 이어 붙이지 못한 구간이 있으면 결과에 틈·중복이 있을 수 있다고 따로 알린다.
        if (res.gaps > 0) notifyInfo(tScroll().gapsNotice(res.gaps));
      } else if (res.kind === 'failed') {
        log.error('[asis] 스크롤 캡처 실패', res.error);
        notifyError(tMain().scroll.failed(userMessageOf(res.error)));
      }
    },
    (err: unknown) => {
      console.error('[asis] scroll capture failed', err);
      notifyError(tMain().scroll.failed(userMessageOf(err)));
    },
  );
}

export const handleScrollCapture = (): void => {
  if (scrollCaptureWindow.isActive()) {
    notifyInfo(tMain().scroll.stopping);
    scrollCaptureWindow.triggerStop();
    return;
  }
  if (rejectIfRecording()) return;
  whenCaptureAllowed(() => {
    selectRegionThen(startScrollCapture, tMain().scroll.startFailed);
  });
};

export const handleStepGuide = (): void => {
  // toggle — 녹화 중이면 기본(HTML)으로 종료.
  if (stepGuideWindow.isActive()) {
    stepGuideWindow.triggerStop('html');
    return;
  }
  if (rejectIfRecording()) return;
  stepGuideWindow.show({
    info: notifyInfo,
    error: notifyError,
    needsAccessibility: () => {
      notifyError(tMain().stepGuide.needsAccessibility);
      openPermissionSettings();
    },
  });
};
