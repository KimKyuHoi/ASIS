import { captureWindow } from '../capture/capture';
import { openPermissionSettings } from '../permissions';
import { hiddenWindows } from '../windows/hiddenWindows';
import type { TrayMenuHandlers } from '../tray';
import { tMain } from '../i18n/strings';
import {
  historyWindow,
  patchHistoryWindow,
  pinWindow,
  rulerOverlay,
  settingsWindow,
} from './managers';
import {
  captureFullscreenByScope,
  handleCapture,
  handleClipboardPin,
  handleDelayedFullscreen,
  handleDelayedRegion,
  handleRegionCapture,
} from './captureFlows';
import { handleGif, handleScrollCapture, handleStepGuide, handleVideo } from './recordingFlows';
import { openGifStudioPicker, openImageStudioPicker } from './fileOpen';
import { notifyInfo } from './notify';

/**
 * 트레이 메뉴·전역 단축키가 함께 쓰는 동작 표. 각 동작은 사용 시점의 언어로 문구를 읽는다.
 */
export function createMenuHandlers(): TrayMenuHandlers {
  return {
    onFullscreen: () => handleCapture(tMain().capture.labelFullscreen, captureFullscreenByScope),
    onWindow: () => handleCapture(tMain().capture.labelWindow, captureWindow),
    onRegion: handleRegionCapture,
    onDelayedFullscreen: handleDelayedFullscreen,
    onDelayedRegion: handleDelayedRegion,
    onDisableClickThrough: () => {
      // 실제로 해제된 핀 수 — 고정 안 된 핀까지 세지 않는다.
      const released = pinWindow.disableAllClickThrough();
      if (released > 0) notifyInfo(tMain().pin.disableClickThrough(released));
    },
    onCloseAllPins: () => {
      const n = pinWindow.count();
      pinWindow.closeAll();
      if (n > 0) notifyInfo(tMain().pin.closed(n));
    },
    onGif: handleGif,
    onVideo: handleVideo,
    onClipboardPin: handleClipboardPin,
    onSettings: () => settingsWindow.show(),
    onHistory: () => historyWindow.show(),
    onImageStudio: openImageStudioPicker,
    onPatchHistory: () => patchHistoryWindow.show(),
    onRuler: () => rulerOverlay.open(),
    onScrollCapture: handleScrollCapture,
    onStepGuide: handleStepGuide,
    onGifStudio: openGifStudioPicker,
    onOpenPermissions: openPermissionSettings,
    onRestoreHidden: () => hiddenWindows.restoreAll(),
  };
}
