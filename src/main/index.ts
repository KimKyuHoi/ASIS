import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  Notification,
  screen,
  shell,
  type WebContents,
} from 'electron';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import log from 'electron-log/main';
import devAppIconPath from '../../resources/icon.png?asset';
import { TrayManager } from './tray';
import { ShortcutManager } from './shortcuts';
import { installAppMenu } from './menu';
import { settingsStore, loadHotkeys, loadMisc, loadEditorHotkeys } from './settings';
import type { EditorHotkeyConfig } from '../shared/editor-hotkeys';
import type { HotkeyConfig, MiscConfig } from './settings';
import {
  captureRegion,
  captureWindow,
  captureWindowById,
  warmScreencapture,
  type CaptureResult,
} from './capture/capture';
import { warmDisplaySnapshot } from './capture/displaySnapshot';
import { SelectionOverlayManager } from './windows/selectionOverlay';
import { EditorWindowManager } from './windows/editorWindow';
import { PinWindowManager } from './windows/pinWindow';
import { RecorderWindowManager } from './windows/recorderWindow';
import { VideoRecorderWindowManager } from './windows/videoRecorderWindow';
import { warmAvfoundationIndices } from './video/screenRecord';
import { recognizeText } from './ocr/ocr';
import { SettingsWindowManager } from './windows/settingsWindow';
import { HistoryWindowManager } from './windows/historyWindow';
import { PatchHistoryWindowManager } from './windows/patchHistoryWindow';
import { RulerOverlayManager } from './windows/rulerOverlay';
import { StepGuideWindowManager } from './windows/stepGuideWindow';
import { ScrollCaptureWindowManager } from './windows/scrollCaptureWindow';
import { getEntries } from './captureHistory';
import { fetchPatchNotes } from './patch-notes/patchNotes';
import { TimeMachineManager } from './time-machine/timeMachine';
import { TimeMachineController } from './time-machine/timeMachineController';
import { TimeMachineHudWindowManager } from './windows/timeMachineHudWindow';
import { checkPermissionsOnLaunch, guardCapture, openPermissionSettings } from './permissions';
import {
  isNewer,
  setupAutoUpdater,
  checkForUpdates,
  isQuittingForUpdate,
} from './updateChecker';
import { CountdownWindow } from './windows/countdownWindow';
import { OnboardingWindowManager } from './windows/onboardingWindow';
import { initLanguage, isLanguageChosen } from './i18n/i18n';
import { tMain } from './i18n/strings';
import { subscribeLanguage } from '../shared/i18n/language';
import type { RunningFeature } from '../shared/running-features';

/**
 * ASIS — macOS 메뉴바 캡처·어노테이션 도구.
 *
 * Phase 3 (현재): 캡처 → 에디터 윈도우 → 어노테이션 → 클립보드 복사.
 *
 * 룰 적용
 *   - side-effects.md — Tray/Shortcut/SelectionOverlay/EditorWindow 모두 Class.
 *     capture 는 stateless 모듈 함수.
 *   - null-safety.md — 캡처/에디터 에러 모두 명시 처리, 사용자 취소는 silent.
 *   - imperative-style.md — main process 전반 명령형 OK.
 */

const trayManager = new TrayManager();
const shortcutManager = new ShortcutManager();
const selectionOverlay = new SelectionOverlayManager();
const editorWindow = new EditorWindowManager();
const pinWindow = new PinWindowManager();
const recorderWindow = new RecorderWindowManager();
const videoRecorderWindow = new VideoRecorderWindowManager();
const settingsWindow = new SettingsWindowManager();
const historyWindow = new HistoryWindowManager();
const patchHistoryWindow = new PatchHistoryWindowManager();
const rulerOverlay = new RulerOverlayManager();
const timeMachine = new TimeMachineManager();
const timeMachineHud = new TimeMachineHudWindowManager();
const stepGuideWindow = new StepGuideWindowManager();
const scrollCaptureWindow = new ScrollCaptureWindowManager();
const countdownWindow = new CountdownWindow();
const onboardingWindow = new OnboardingWindowManager();
editorWindow.setPinHandler((dataUrl, w, h) => pinWindow.pin(dataUrl, w, h));

/**
 * 지금 진행 중인 녹화·캡처 목록.
 *
 * 순서 = 표시 우선순위. 타임머신을 뒤로 미루는 이유: 상시 녹화라 거의 항상 켜져
 * 있는데, 그게 앞에 오면 GIF·영상 녹화 중이라는 사실을 메뉴바 인디케이터가
 * 가려버린다. 타임머신은 자체 HUD(timeMachineHudWindow) 로 이미 보인다.
 */
function runningFeatures(): RunningFeature[] {
  const running: RunningFeature[] = [];
  if (recorderWindow.isActive()) running.push('gif');
  if (videoRecorderWindow.isActive()) running.push('video');
  if (stepGuideWindow.isActive()) running.push('stepGuide');
  if (scrollCaptureWindow.isActive()) running.push('scrollCapture');
  if (timeMachineController.isRunning()) running.push('timeMachine');
  return running;
}

/**
 * 단축키 녹화 중 억제 대상 webContents. null = 녹화 중 아님.
 *
 * 녹화 동안에는 두 가지가 키 입력을 먼저 가로챈다:
 *  (a) 전역 단축키 — ⌘⇧A 를 누르면 영역 캡처가 실행돼 버린다.
 *  (b) 앱 메뉴 accelerator — ⌘W(닫기)·⌘A(전체 선택)·⌘Z(실행 취소) 등.
 * 둘 다 끈 뒤 renderer 의 keydown 만으로 순수 조합을 받는다.
 * setIgnoreMenuShortcuts 는 page keydown 은 그대로 두고 메뉴 accelerator 만 무시한다.
 * 출처: electronjs.org/docs/latest/api/web-contents (setIgnoreMenuShortcuts / destroyed).
 */
let hotkeyRecordingContents: WebContents | null = null;

/**
 * @param resumeShortcuts 전역 단축키를 다시 등록할지. 앱 종료 경로에서는 false —
 *   stopAllManagers 가 이미 끈 단축키를 되살리면 종료 도중 재등록이 일어난다.
 */
function endHotkeyRecording(resumeShortcuts: boolean): void {
  if (!hotkeyRecordingContents) return;
  const contents = hotkeyRecordingContents;
  hotkeyRecordingContents = null;
  contents.removeListener('destroyed', onHotkeyRecordingContentsDestroyed);
  // 파괴된 webContents 에 메서드를 호출하면 throw — 파괴 경로에서는 건너뛴다.
  if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(false);
  if (resumeShortcuts) shortcutManager.resume();
}

function onHotkeyRecordingContentsDestroyed(): void {
  endHotkeyRecording(true);
}

/**
 * 모든 매니저 정리 — stopped 플래그가 세워져 prewarm 의 closed→재생성 재귀가
 * 차단된다. before-quit 과 업데이트 설치 경로(updateChecker) 양쪽에서 호출되며,
 * 각 stop() 은 멱등이라 이중 호출 안전.
 */
const stopAllManagers = (): void => {
  // 녹화 상태 정리를 먼저 — 아래 settingsWindow.stop() 이 webContents 를 파괴할 때
  // destroyed 콜백이 방금 끈 전역 단축키를 되살리는 것을 막는다.
  endHotkeyRecording(false);
  shortcutManager.stop();
  trayManager.stop();
  selectionOverlay.stop();
  editorWindow.stop();
  pinWindow.closeAll();
  recorderWindow.stop();
  videoRecorderWindow.stop();
  settingsWindow.stop();
  historyWindow.stop();
  patchHistoryWindow.stop();
  rulerOverlay.stop();
  timeMachine.dispose();
  // 컨트롤러가 HUD 알약과 표시 타이머까지 함께 정리한다 (선언은 아래 — 호출은
  // before-quit 시점이라 초기화 완료 후다).
  timeMachineController.dispose();
  stepGuideWindow.stop();
  scrollCaptureWindow.stop();
  onboardingWindow.stop();
};

// 단일 인스턴스 보장.
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  app.quit();
}

// macOS 에서 알림 전달 실패(UNNotification 권한·등록 문제 등)는 기본적으로 조용히
// 사라진다. failed/show 이벤트를 로그로 남겨 "알림이 안 뜬다" 이슈를 사후 진단한다.
// https://www.electronjs.org/docs/latest/api/notification
const notify = (title: string, body: string, onClick?: () => void): void => {
  const n = new Notification({ title, body });
  n.on('failed', (_event, error) => log.error('[notify] failed', { title, body, error }));
  n.on('show', () => log.info('[notify] shown', { title, body }));
  if (onClick) n.on('click', () => onClick());
  n.show();
};

const notifyInfo = (body: string): void => {
  notify('ASIS', body);
};

const notifyError = (body: string): void => {
  notify(tMain().notify.errorTitle, body);
};

/** 클릭하면 후속 동작이 있는 알림 (예: 저장 완료 → Finder 에서 파일 표시). */
const notifyAction = (body: string, onClick: () => void): void => {
  notify('ASIS', body, onClick);
};

/**
 * 타임머신 조율자 — 시작/정지/저장 상태를 소유하고 HUD 알약·트레이·알림에 뿌린다.
 * notify 계열을 참조하므로 그 정의 이후에 만든다.
 */
const timeMachineController = new TimeMachineController({
  manager: timeMachine,
  hud: timeMachineHud,
  bufferSeconds: () => loadMisc().timeMachineBufferSeconds,
  drmDetectEnabled: () => loadMisc().drmDetectEnabled,
  guardCapture: () => guardCapture(),
  notifyInfo,
  notifyError,
  notifyAction,
  onStateChanged: () => trayManager.refresh(),
});

/**
 * overlay 의 BrowserWindow close 후 macOS compositor 가 dim 픽셀을 화면에서
 * 완전히 제거할 때까지 대기. 캡처 결과에 검은/흰 잔상이 남지 않도록 한다.
 * 200ms 면 NSPanel close + Space 재합성까지 안전 (사용자 인지 어려운 지연).
 */
const OVERLAY_CLOSE_DELAY_MS = 200;

/**
 * 캡처 → 에디터 → 클립보드 흐름 (권한 체크 없음 — 호출 전 체크 완료 가정).
 */
const runCapture = (
  label: string,
  capture: () => Promise<CaptureResult>,
): void => {
  capture().then(
    (result) => {
      if (result.kind !== 'success') return;
      // 캡처 완료음은 screencapture 의 네이티브 셔터음이 캡처 시점에 재생한다
      // (capture.ts soundArgs) — 여기서 별도 재생하지 않는다.
      // 에디터 자동 열기 OFF — 에디터를 띄우지 않고 바로 클립보드에 복사한다.
      if (!loadMisc().autoOpenEditor) {
        const image = nativeImage.createFromPath(result.path);
        if (image.isEmpty()) {
          notifyError(tMain().capture.imageReadFailed(label));
          return;
        }
        clipboard.writeImage(image);
        notifyInfo(tMain().capture.copiedToClipboard(label));
        return;
      }
      editorWindow.show(result.path).then(
        (editorResult) => {
          if (editorResult.kind === 'copied') {
            notifyInfo(tMain().capture.copiedToClipboard(label));
          }
        },
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[asis] ${label} 에디터 실패`, err);
          notifyError(tMain().capture.editorFailed(label, message));
        },
      );
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[asis] ${label} 실패`, err);
      notifyError(tMain().capture.failed(label, message));
    },
  );
};

/**
 * 캡처 → 에디터 → 클립보드 흐름 (권한 체크 포함).
 */
const handleCapture = (
  label: string,
  capture: () => Promise<CaptureResult>,
): void => {
  guardCapture().then((ok) => {
    if (!ok) return;
    runCapture(label, capture);
  });
};

const handleRegionCapture = (): void => {
  guardCapture().then((ok) => {
    if (!ok) return;
    selectionOverlay.show().then(
      (result) => {
        if (result.kind === 'selected') {
          const { windowId, ...rect } = result.rect;
          // overlay close 후 macOS compositor 의 dim 잔상이 캡처에 들어가지
          // 않도록 OVERLAY_CLOSE_DELAY_MS 대기 후 screencapture 실행.
          setTimeout(() => {
            handleCapture(tMain().capture.labelRegion, () =>
              // Dock 아이템은 가짜 음수 ID — screencapture -l 가 invalid 처리하므로
              // rect 기반 captureRegion 으로 fallback. 일반 윈도우(양수 ID) 는 그대로.
              windowId !== undefined && windowId > 0
                ? captureWindowById(windowId)
                : captureRegion(rect),
            );
          }, OVERLAY_CLOSE_DELAY_MS);
        }
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[asis] 영역 선택 오버레이 실패', err);
        notifyError(tMain().capture.regionSelectFailed(message));
      },
    );
  });
};

/**
 * 클립보드 이미지를 *바로 Pin* (Snipaste F3).
 * 클립보드가 빈 이미지면 알림으로 안내.
 */
const handleClipboardPin = (): void => {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    notifyInfo(tMain().pin.empty);
    return;
  }
  const { width, height } = image.getSize();
  const dataUrl = image.toDataURL();
  pinWindow.pin(dataUrl, width, height);
};

const handleGif = (): void => {
  // 녹화 중이면 정지 (toggle) — 알약 안 띄우니 *유일한 회수 경로*.
  if (recorderWindow.isActive()) {
    notifyInfo(tMain().gif.encoding);
    recorderWindow.triggerStop();
    return;
  }
  // 영역 선택 → 녹화 → GIF 저장.
  guardCapture().then((ok) => {
    if (!ok) return;
    selectionOverlay.show().then(
      (selResult) => {
        if (selResult.kind !== 'selected') return;
        const showPromise = recorderWindow.show(selResult.rect);
        // 메뉴바 ● 인디케이터·트레이 정지 항목 반영. 알약이 hidden 인 전체화면
        // 녹화에서는 이게 "녹화 중" 을 보여주는 유일한 상시 단서다.
        trayManager.refresh();
        showPromise.finally(() => trayManager.refresh());
        if (recorderWindow.isHidden()) {
          notifyInfo(tMain().gif.recording);
        }
        showPromise.then(
          (recResult) => {
            if (recResult.kind === 'saved') {
              notifyInfo(tMain().gif.saved(recResult.path));
            } else if (recResult.kind === 'failed') {
              notifyError(tMain().gif.encodeFailed(recResult.error.message));
            }
          },
          (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[asis] recorder failed', err);
            notifyError(tMain().gif.recordFailed(message));
          },
        );
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[asis] GIF 영역 선택 실패', err);
        notifyError(tMain().gif.startFailed(message));
      },
    );
  });
};

const handleVideo = (): void => {
  // 녹화 중이면 정지 (toggle) — 알약 hidden 케이스의 유일한 회수 경로.
  if (videoRecorderWindow.isActive()) {
    notifyInfo(tMain().video.stopping);
    videoRecorderWindow.triggerStop();
    return;
  }
  // 영역/창 선택 → 녹화 → .mov 저장.
  guardCapture().then((ok) => {
    if (!ok) return;
    // 사용자가 영역을 고르는 동안 ffmpeg 장치 열거를 미리 끝내 둔다 —
    // 선택 완료 → 녹화 시작 사이의 -list_devices spawn(수백 ms) 제거.
    warmAvfoundationIndices();
    selectionOverlay.show().then(
      (selResult) => {
        if (selResult.kind !== 'selected') return;
        // 창을 선택해도 Phase 1 은 그 창의 rect 를 -R 로 녹화한다(창 이동 미추적).
        const r = selResult.rect;
        const rect = { x: r.x, y: r.y, w: r.w, h: r.h };
        const showPromise = videoRecorderWindow.show(rect);
        trayManager.refresh();
        showPromise.finally(() => trayManager.refresh());
        if (videoRecorderWindow.isHidden()) {
          notifyInfo(tMain().video.recording);
        }
        showPromise.then(
          (recResult) => {
            if (recResult.kind === 'saved') {
              notifyInfo(tMain().video.saved(recResult.path));
            } else if (recResult.kind === 'failed') {
              notifyError(tMain().video.failed(recResult.error.message));
            }
          },
          (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[asis] video recorder failed', err);
            notifyError(tMain().video.failed(message));
          },
        );
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[asis] 화면 녹화 영역 선택 실패', err);
        notifyError(tMain().video.startFailed(message));
      },
    );
  });
};

const handleOcr = (): void => {
  guardCapture().then((ok) => {
    if (!ok) return;
    selectionOverlay.show().then(
      (result) => {
        if (result.kind !== 'selected') return;
        // OCR 은 창/영역 구분 없이 그 영역만 인식하면 되므로 rect 로 캡처한다.
        const r = result.rect;
        const rect = { x: r.x, y: r.y, w: r.w, h: r.h };
        setTimeout(() => {
          captureRegion(rect).then(
            (cap) => {
              if (cap.kind !== 'success') return;
              const cleanup = (): void => {
                unlink(cap.path).catch((e: unknown) =>
                  console.warn('[asis] OCR tmp cleanup failed', e),
                );
              };
              recognizeText(cap.path).then(
                (text) => {
                  cleanup();
                  const trimmed = text.trim();
                  if (!trimmed) {
                    notifyInfo(tMain().ocr.noText);
                    return;
                  }
                  clipboard.writeText(trimmed);
                  notifyInfo(tMain().ocr.copied);
                },
                (err: unknown) => {
                  cleanup();
                  const message =
                    err instanceof Error ? err.message : String(err);
                  console.error('[asis] OCR 실패', err);
                  notifyError(tMain().ocr.failed(message));
                },
              );
            },
            (err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              console.error('[asis] OCR 캡처 실패', err);
              notifyError(tMain().ocr.failed(message));
            },
          );
        }, OVERLAY_CLOSE_DELAY_MS);
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[asis] OCR 영역 선택 실패', err);
        notifyError(tMain().ocr.failed(message));
      },
    );
  });
};

const handleScrollCapture = (): void => {
  // 녹화 중이면 정지 (toggle).
  if (scrollCaptureWindow.isActive()) {
    notifyInfo(tMain().scroll.stopping);
    scrollCaptureWindow.triggerStop();
    return;
  }
  guardCapture().then((ok) => {
    if (!ok) return;
    selectionOverlay.show().then(
      (selResult) => {
        if (selResult.kind !== 'selected') return;
        const r = selResult.rect;
        const rect = { x: r.x, y: r.y, w: r.w, h: r.h };
        const showPromise = scrollCaptureWindow.show(rect);
        trayManager.refresh();
        showPromise.finally(() => trayManager.refresh());
        if (scrollCaptureWindow.isHidden()) {
          notifyInfo(tMain().scroll.recording);
        }
        showPromise.then(
          (res) => {
            if (res.kind === 'saved') {
              notifyInfo(tMain().scroll.saved(res.path));
            } else if (res.kind === 'copied') {
              notifyInfo(tMain().scroll.copied);
            } else if (res.kind === 'failed') {
              notifyError(tMain().scroll.failed(res.error.message));
            }
          },
          (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[asis] scroll capture failed', err);
            notifyError(tMain().scroll.failed(message));
          },
        );
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[asis] 스크롤 캡처 영역 선택 실패', err);
        notifyError(tMain().scroll.startFailed(message));
      },
    );
  });
};

// 환경설정 IPC — 앱 전체 lifecycle 동안 유효.
ipcMain.handle('settings:get', () => loadHotkeys());

// ESC — 환경설정 창 닫기.
ipcMain.on('settings:close', () => {
  settingsWindow.stop();
});

/**
 * 지금 실행 중인 기능 목록 — 환경설정 창의 경고 배너용.
 * 녹화·캡처가 도는 중에 단축키를 만지면 그 동안 전역 단축키가 멈추고,
 * GIF/영상 녹화처럼 ESC 를 전역 등록해 둔 기능은 ESC 로 취소돼 버린다.
 */
ipcMain.handle('settings:get-running-features', () => runningFeatures());

ipcMain.on('settings:hotkey-recording', (event, active: boolean) => {
  if (!active) {
    endHotkeyRecording(true);
    return;
  }
  if (hotkeyRecordingContents) return;
  hotkeyRecordingContents = event.sender;
  event.sender.setIgnoreMenuShortcuts(true);
  // 녹화 도중 창이 닫히면 종료 신호가 오지 않는다 — 전역 단축키가 영영 죽지 않도록 복구.
  event.sender.once('destroyed', onHotkeyRecordingContentsDestroyed);
  shortcutManager.pause();
});
ipcMain.handle('settings:set', (_event, hotkeys: HotkeyConfig) => {
  settingsStore.set('hotkeys', hotkeys);
  shortcutManager.reload();
  // 트레이 메뉴의 accelerator 표기가 저장값을 읽으므로 재빌드.
  trayManager.refresh();
});

// 에디터 도구 단축키 — 열려 있는 에디터 창에도 즉시 반영한다 (창을 다시 열 필요 없음).
ipcMain.handle('settings:get-editor-hotkeys', () => loadEditorHotkeys());
ipcMain.handle('settings:set-editor-hotkeys', (_event, hotkeys: EditorHotkeyConfig) => {
  settingsStore.set('editorHotkeys', hotkeys);
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:editor-hotkeys-changed', hotkeys);
  }
});

ipcMain.handle('settings:get-folder', () => settingsStore.get('saveFolderPath'));
ipcMain.handle('settings:set-folder', (_event, path: string) => {
  settingsStore.set('saveFolderPath', path);
});
ipcMain.handle('settings:pick-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: tMain().capture.saveFolderDialogTitle,
    defaultPath: settingsStore.get('saveFolderPath') || app.getPath('pictures'),
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const picked = result.filePaths[0];
  settingsStore.set('saveFolderPath', picked);
  return picked;
});

ipcMain.handle('settings:get-misc', () => loadMisc());
ipcMain.handle('settings:set-misc', (_event, misc: MiscConfig) => {
  settingsStore.set('misc', misc);
  // dev 에서는 Electron 바이너리가 로그인 항목으로 등록돼 버리므로 패키징 앱에서만.
  if (process.platform === 'darwin' && app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: misc.openAtLogin });
  }
});

// 첫 실행 언어 선택 완료 — onboarding 창을 닫는다. 언어 저장 자체는
// i18n:set-language(i18n/i18n.ts) 가 처리하므로 여기서는 창 정리만 한다.
ipcMain.on('i18n:onboarding-done', () => {
  onboardingWindow.stop();
});

// 히스토리 IPC
ipcMain.handle('history:list', () => getEntries());
ipcMain.handle('history:copy', (_event, dataUrl: string) => {
  const img = nativeImage.createFromDataURL(dataUrl);
  clipboard.writeImage(img);
});
ipcMain.handle('history:pin', (_event, dataUrl: string, w: number, h: number) => {
  pinWindow.pin(dataUrl, w, h);
});

// 변경 이력 IPC — GitHub Releases 조회.
ipcMain.handle('patch-history:list', () => fetchPatchNotes());
ipcMain.handle('patch-history:open-url', (_event, url: string) =>
  shell.openExternal(url),
);

// 텍스트 클립보드 복사 — color picker 의 HEX/RGB/HSL 등.
// renderer 의 navigator.clipboard.writeText 는 창 포커스·우클릭(user activation 미부여)
// 상황에서 거부될 수 있어, main 의 clipboard.writeText 로 우회한다(포커스 무관).
ipcMain.handle('clipboard:write-text', (_event, text: string) => {
  clipboard.writeText(text);
});

// fullscreen Space 호환성 — macOS 의 regular 앱은 자체 Space 컨텍스트를 가져서
// `makeKeyAndOrderFront:` → NSApp 활성화 → macOS 가 ASIS Space 로 강제 전환된다.
// accessory 앱은 Space 컨텍스트가 없어 이 전환이 원천 차단된다.
// `whenReady` *이전* 에 호출 = initial 설정 → macOS 26β 의 dynamic LSUIElement
// 전환 시 키보드 포커스 영구 차단 회귀를 회피.
// app.dock.hide() 같은 동적 전환은 절대 호출하지 않는다.
if (process.platform === 'darwin') {
  app.setActivationPolicy('accessory');
  if (is.dev) console.info('[asis] app.setActivationPolicy("accessory") applied');
}

// electron-updater 이벤트 리스너를 app.whenReady 이전에 등록.
// stopAllManagers 주입 — 설치 직전 prewarm 재생성 차단 + 창 정리용.
setupAutoUpdater(stopAllManagers);

app.whenReady().then(() => {
  // [perf] 콜드스타트 진단 — 프로세스 시작 → whenReady 까지 걸린 시간.
  log.info(`[perf] whenReady +${Math.round(process.uptime() * 1000)}ms`);

  electronApp.setAppUserModelId('com.pinkfong.asis');

  // 언어 로드 + i18n IPC 등록 — 첫 BrowserWindow(prewarm 포함)·메뉴 설치보다
  // 반드시 먼저 실행돼야 preload sendSync 와 메뉴 라벨이 올바른 언어를 본다.
  initLanguage();
  // 언어 변경 → 트레이 툴팁·컨텍스트 메뉴와 앱 메뉴 재빌드. 앱 수명 구독.
  subscribeLanguage(() => {
    trayManager.refresh();
    installAppMenu();
  });

  // 기본 메뉴의 zoom accelerator(Cmd +/-/0)가 에디터 줌 단축키를 가로채는 것을 막는다.
  installAppMenu();

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // prewarm 을 whenReady 최상단에서 시작 — 앱 시작 직후 단축키를 눌렀을 때
  // renderer 로드가 끝나 있을 확률을 높인다. 단축키 임계 경로인 selection 을
  // editor(번들이 훨씬 큼)보다 먼저 로드해 dev 서버/디스크 IO 경합에서 우선권을 준다.
  selectionOverlay.prewarm();
  editorWindow.prewarm();

  // screencapture 첫 spawn 의 SCK/TCC 초기화 콜드스타트(실측 629ms)를 미리 치러
  // 둔다 — 첫 실제 캡처가 warm 속도(~110ms)로 시작한다.
  warmScreencapture();
  // CG background 캡처 경로도 동일하게 warm-up (첫 호출 ~80ms → 이후 ~20ms).
  warmDisplaySnapshot();

  // 업데이트 완료 감지 — lastLaunchedVersion 이 현재보다 낮으면 방금 업데이트된 것.
  const current = app.getVersion();
  const lastVersion = settingsStore.get('lastLaunchedVersion');
  // lastVersion 이 '' (기본값, falsy) 인 경우도 포함 — isNewer 는 '' 을 '0.0.0' 으로 처리한다.
  if (isNewer(current, lastVersion)) {
    notifyInfo(tMain().app.updateComplete(current));
  }
  settingsStore.set('lastLaunchedVersion', current);

  // 업데이트 체크 — 앱 시작 5초 후 첫 체크, 이후 3일마다 반복.
  // electron-updater 가 백그라운드 다운로드 → 완료 후 설치 확인 다이얼로그를 처리한다.
  // 트레이·단축키 초기화보다 *먼저* 예약한다 — 그쪽에서 예외가 나더라도 자동 업데이트
  // 경로는 살아 있어야 고장난 버전에서 빠져나올 수 있다 (v0.7.2 시작 실패 교훈).
  const CHECK_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3일
  setTimeout(() => checkForUpdates(), 5000);
  setInterval(() => checkForUpdates(), CHECK_INTERVAL_MS);

  // 로그인 항목 재단언 — 과거 dev 실행이나 옛 번들이 잘못된 경로(휴지통의 백업
  // 번들 등)로 등록했거나 등록이 유실된 경우를 저장된 설정 기준으로 복구한다.
  // status: not-registered | enabled | requires-approval | not-found (macOS 13+).
  // https://www.electronjs.org/docs/latest/api/app (getLoginItemSettings)
  if (process.platform === 'darwin' && app.isPackaged) {
    const wanted = loadMisc().openAtLogin;
    const loginItem = app.getLoginItemSettings();
    log.info('[loginItem]', {
      wanted,
      registered: loginItem.openAtLogin,
      status: loginItem.status,
    });
    if (loginItem.openAtLogin !== wanted) {
      app.setLoginItemSettings({ openAtLogin: wanted });
    }
  }

  if (process.platform === 'darwin' && app.dock) {
    const prodPath = join(process.resourcesPath, 'icon.png');
    const iconPath = existsSync(prodPath) ? prodPath : devAppIconPath;
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }

  // macOS 26 β 에서 app.dock.hide() 호출 시 *모든 자식 윈도우의 키보드 focus*
  // 가 영구 차단되는 회귀가 발견됨 (dynamic LSUIElement 전환 거부).
  // 일단 dock 표시 유지 — Dock 에 ASIS 아이콘 항상 보이지만 textarea/단축키 정상.
  // v2 에서 native osascript 또는 Info.plist 의 LSUIElement=YES 정적 설정 우회 검토.
  // (process.platform === 'darwin' && app.dock) {
  //   app.dock.hide();
  // }

  const onFullscreen = (): void => {
    // 커서가 있는 디스플레이를 캡처 — 다중 모니터 지원.
    const cursor = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(cursor);
    handleCapture(tMain().capture.labelFullscreen, () =>
      captureRegion({ x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height }),
    );
  };
  const onWindow = (): void => {
    handleCapture(tMain().capture.labelWindow, captureWindow);
  };
  const onRegion = (): void => {
    handleRegionCapture();
  };

  // 지연 캡처 — 호버 상태 캡처용. 영역은 먼저 선택, 그 후 3초 대기 후 캡처.
  const onDelayedFullscreen = (): void => {
    guardCapture().then((ok) => {
      if (!ok) return;
      const delayMs = loadMisc().delayedCaptureSeconds * 1000;
      const cursor = screen.getCursorScreenPoint();
      countdownWindow.show(delayMs / 1000, cursor);
      setTimeout(() => {
        countdownWindow.close();
        const newCursor = screen.getCursorScreenPoint();
        const d = screen.getDisplayNearestPoint(newCursor);
        runCapture(tMain().capture.labelFullscreen, () =>
          captureRegion({ x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height }),
        );
      }, delayMs);
    });
  };

  const onDelayedRegion = (): void => {
    guardCapture().then((ok) => {
      if (!ok) return;
      selectionOverlay.show().then(
        (result) => {
          if (result.kind !== 'selected') return;
          const delayMs = loadMisc().delayedCaptureSeconds * 1000;
          const cursor = screen.getCursorScreenPoint();
          countdownWindow.show(delayMs / 1000, cursor);
          setTimeout(() => {
            countdownWindow.close();
            const { windowId, ...rect } = result.rect;
            runCapture(tMain().capture.labelRegion, () =>
              // Dock 아이템은 가짜 음수 ID — screencapture -l 가 invalid 처리하므로
              // rect 기반 captureRegion 으로 fallback. 일반 윈도우(양수 ID) 는 그대로.
              windowId !== undefined && windowId > 0
                ? captureWindowById(windowId)
                : captureRegion(rect),
            );
          }, delayMs);
        },
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[asis] 지연 영역 선택 실패', err);
          notifyError(tMain().capture.regionSelectFailed(message));
        },
      );
    });
  };
  const onDisableClickThrough = (): void => {
    pinWindow.disableAllClickThrough();
    if (pinWindow.count() > 0) {
      notifyInfo(tMain().pin.disableClickThrough(pinWindow.count()));
    }
  };
  const onCloseAllPins = (): void => {
    const n = pinWindow.count();
    pinWindow.closeAll();
    if (n > 0) notifyInfo(tMain().pin.closed(n));
  };
  const onGif = (): void => {
    handleGif();
  };
  const onVideo = (): void => {
    handleVideo();
  };
  const onOcr = (): void => {
    handleOcr();
  };
  const onClipboardPin = (): void => {
    handleClipboardPin();
  };
  const onSettings = (): void => {
    settingsWindow.show();
  };
  const onHistory = (): void => {
    historyWindow.show();
  };
  const onPatchHistory = (): void => {
    patchHistoryWindow.show();
  };
  const onRuler = (): void => {
    rulerOverlay.open();
  };
  const onScrollCapture = (): void => {
    handleScrollCapture();
  };
  const onStepGuide = (): void => {
    // toggle — 녹화 중이면 기본(HTML)으로 종료.
    if (stepGuideWindow.isActive()) {
      stepGuideWindow.triggerStop('html');
      return;
    }
    stepGuideWindow.show({
      info: notifyInfo,
      error: notifyError,
      needsAccessibility: () => {
        notifyError(tMain().stepGuide.needsAccessibility);
        openPermissionSettings();
      },
    });
  };
  // 타임머신 흐름 전체(상태·HUD·트레이·알림)는 컨트롤러가 소유한다.
  const onTimeMachineToggle = (): void => timeMachineController.toggle();
  const onTimeMachineSave = (): void => timeMachineController.save();
  const onOpenPermissions = (): void => {
    openPermissionSettings();
  };

  const handlers = {
    onFullscreen,
    onWindow,
    onRegion,
    onDelayedFullscreen,
    onDelayedRegion,
    onDisableClickThrough,
    onCloseAllPins,
    onGif,
    onVideo,
    onOcr,
    onClipboardPin,
    onSettings,
    onHistory,
    onPatchHistory,
    onRuler,
    onScrollCapture,
    onStepGuide,
    onTimeMachineToggle,
    onTimeMachineSave,
    onOpenPermissions,
  };
  trayManager.start(handlers, {
    isTimeMachineRunning: () => timeMachineController.isRunning(),
    timeMachineSavePhase: () => timeMachineController.savePhase(),
    timeMachineBufferSeconds: () => loadMisc().timeMachineBufferSeconds,
    activeRecording: () => runningFeatures()[0] ?? null,
  });
  // 스텝 가이드는 show() 가 void 라 종료 시점을 Promise 로 못 받는다 — 콜백으로 통지받아
  // 메뉴바 인디케이터를 내린다 (GIF·영상·스크롤 캡처는 show() 의 finally 에서 처리).
  stepGuideWindow.onActiveChange = (): void => trayManager.refresh();

  // 단축키 등록 실패(손상된 저장값·다른 앱 선점)는 항목별로 알리고 나머지는 계속 등록한다.
  // 손상값은 ShortcutManager 가 '해제' 로 복구해 저장하므로 설정 창에도 그대로 반영된다.
  shortcutManager.onFailures = (failures): void => {
    log.warn('[shortcuts] registration failures', failures);
    const t = tMain().shortcuts;
    const lines = failures.map((f) =>
      f.kind === 'invalid'
        ? t.invalidRepaired(t.names[f.key])
        : t.taken(t.names[f.key], f.accelerator),
    );
    notifyError(t.someFailed(lines));
    // 해제로 복구된 항목의 accelerator 표기를 트레이 메뉴에서도 지운다.
    trayManager.refresh();
  };
  try {
    shortcutManager.start(handlers);
  } catch (err: unknown) {
    // 단축키는 트레이 메뉴로 대체 가능한 부가 경로 — 앱 시작 전체를 실패시키지 않는다.
    const message = err instanceof Error ? err.message : String(err);
    log.error('[shortcuts] start failed', err);
    notifyError(tMain().shortcuts.startFailed(message));
  }

  // ffmpeg 가 스스로 죽으면(권한 거부 등) 토글을 거치지 않는다 — 알약이 "녹화 중"인
  // 채 남지 않도록 컨트롤러가 표시를 내리고 사유를 알린다.
  timeMachine.onEarlyExit = (): void => {
    timeMachineController.handleEarlyExit();
  };

  // 첫 실행(언어 미선택) — 언어 선택 창을 띄운다. 이후 실행에는 나타나지 않는다.
  if (!isLanguageChosen()) {
    onboardingWindow.show();
  }

  // 앱 시작 직후 권한 상태 확인 — 거부/미설정 시 안내 다이얼로그 표시.
  checkPermissionsOnLaunch().catch((err: unknown) => {
    console.error('[asis] permission check failed', err);
  });
}).catch((err: unknown) => {
  // app.whenReady() 체인의 미처리 에러가 조용히 삼켜지는 걸 방지.
  console.error('[asis] app initialization failed', err);
  dialog.showErrorBox(
    tMain().app.startFailedTitle,
    String(err instanceof Error ? err.message : err),
  );
});

app.on('window-all-closed', () => {
  // macOS 는 트레이 앱이라 모든 창이 닫혀도 평소엔 종료하지 않는다.
  // 단, 자동 업데이트 설치(quitAndInstall) 중에는 반드시 종료해야 Squirrel.Mac 의
  // ShipIt 이 번들 교체를 진행한다. quitAndInstall 경로는 before-quit 을 정상 순서로
  // 발생시키지 않으므로 여기서 플래그를 직접 확인한다. → electron/electron#15453
  if (process.platform !== 'darwin' || isQuittingForUpdate()) {
    app.quit();
  }
});

app.on('before-quit', () => {
  log.info('[app] before-quit', { quittingForUpdate: isQuittingForUpdate() });
  stopAllManagers();
});
