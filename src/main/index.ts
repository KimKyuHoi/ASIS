import { app, clipboard, dialog, ipcMain, nativeImage, Notification, screen } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import devAppIconPath from '../../resources/icon.png?asset';
import { TrayManager } from './tray';
import { ShortcutManager } from './shortcuts';
import { settingsStore } from './settings';
import type { HotkeyConfig, MiscConfig } from './settings';
import {
  captureRegion,
  captureWindow,
  captureWindowById,
  type CaptureResult,
} from './capture';
import { SelectionOverlayManager } from './windows/selectionOverlay';
import { EditorWindowManager } from './windows/editorWindow';
import { PinWindowManager } from './windows/pinWindow';
import { RecorderWindowManager } from './windows/recorderWindow';
import { SettingsWindowManager } from './windows/settingsWindow';
import { HistoryWindowManager } from './windows/historyWindow';
import { getEntries } from './captureHistory';
import { checkPermissionsOnLaunch, guardCapture, openPermissionSettings } from './permissions';
import { isNewer, setupAutoUpdater, checkForUpdates } from './updateChecker';
import { CountdownWindow } from './windows/countdownWindow';

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
const settingsWindow = new SettingsWindowManager();
const historyWindow = new HistoryWindowManager();
const countdownWindow = new CountdownWindow();
editorWindow.setPinHandler((dataUrl, w, h) => pinWindow.pin(dataUrl, w, h));

// 단일 인스턴스 보장.
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  app.quit();
}

const notifyInfo = (body: string): void => {
  new Notification({ title: 'ASIS', body }).show();
};

const notifyError = (body: string): void => {
  new Notification({ title: 'ASIS — 오류', body }).show();
};

const HOVER_DELAY_MS = 3000;
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
      editorWindow.show(result.path).then(
        (editorResult) => {
          if (editorResult.kind === 'copied') {
            notifyInfo(`${label} — 클립보드에 복사되었습니다`);
            if (settingsStore.get('misc').captureSound && process.platform === 'darwin') {
              spawn('afplay', ['/System/Library/Sounds/Tink.aiff']).on('error', () => {});
            }
          }
        },
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[asis] ${label} 에디터 실패`, err);
          notifyError(`${label} 에디터 실패: ${message}`);
        },
      );
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[asis] ${label} 실패`, err);
      notifyError(`${label} 실패: ${message}`);
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
            handleCapture('영역 캡처', () =>
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
        notifyError(`영역 선택 실패: ${message}`);
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
    notifyInfo('클립보드에 이미지가 없습니다');
    return;
  }
  const { width, height } = image.getSize();
  const dataUrl = image.toDataURL();
  pinWindow.pin(dataUrl, width, height);
};

const handleGif = (): void => {
  // 녹화 중이면 정지 (toggle) — 알약 안 띄우니 *유일한 회수 경로*.
  if (recorderWindow.isActive()) {
    notifyInfo('GIF 인코딩 중…');
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
        if (recorderWindow.isHidden()) {
          notifyInfo('GIF 녹화 중 — 단축키로 정지');
        }
        showPromise.then(
          (recResult) => {
            if (recResult.kind === 'saved') {
              notifyInfo(`GIF 저장 — ${recResult.path}`);
            } else if (recResult.kind === 'failed') {
              notifyError(`GIF 인코딩 실패: ${recResult.error.message}`);
            }
          },
          (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[asis] recorder failed', err);
            notifyError(`GIF 녹화 실패: ${message}`);
          },
        );
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[asis] GIF 영역 선택 실패', err);
        notifyError(`GIF 시작 실패: ${message}`);
      },
    );
  });
};

// 환경설정 IPC — 앱 전체 lifecycle 동안 유효.
ipcMain.handle('settings:get', () => settingsStore.get('hotkeys'));
ipcMain.handle('settings:set', (_event, hotkeys: HotkeyConfig) => {
  settingsStore.set('hotkeys', hotkeys);
  shortcutManager.reload();
});

ipcMain.handle('settings:get-folder', () => settingsStore.get('saveFolderPath'));
ipcMain.handle('settings:set-folder', (_event, path: string) => {
  settingsStore.set('saveFolderPath', path);
});
ipcMain.handle('settings:pick-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: '저장 폴더 선택',
    defaultPath: settingsStore.get('saveFolderPath') || app.getPath('pictures'),
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const picked = result.filePaths[0];
  settingsStore.set('saveFolderPath', picked);
  return picked;
});

ipcMain.handle('settings:get-misc', () => settingsStore.get('misc'));
ipcMain.handle('settings:set-misc', (_event, misc: MiscConfig) => {
  settingsStore.set('misc', misc);
  if (process.platform === 'darwin') {
    app.setLoginItemSettings({ openAtLogin: misc.openAtLogin });
  }
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
setupAutoUpdater();

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pinkfong.asis');

  // 업데이트 완료 감지 — lastLaunchedVersion 이 현재보다 낮으면 방금 업데이트된 것.
  const current = app.getVersion();
  const lastVersion = settingsStore.get('lastLaunchedVersion');
  // lastVersion 이 '' (기본값, falsy) 인 경우도 포함 — isNewer 는 '' 을 '0.0.0' 으로 처리한다.
  if (isNewer(current, lastVersion)) {
    notifyInfo(`ASIS ${current} 업데이트 완료!`);
  }
  settingsStore.set('lastLaunchedVersion', current);

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

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const onFullscreen = (): void => {
    // 커서가 있는 디스플레이를 캡처 — 다중 모니터 지원.
    const cursor = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(cursor);
    handleCapture('전체화면 캡처', () =>
      captureRegion({ x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height }),
    );
  };
  const onWindow = (): void => {
    handleCapture('윈도우 캡처', captureWindow);
  };
  const onRegion = (): void => {
    handleRegionCapture();
  };

  // 지연 캡처 — 호버 상태 캡처용. 영역은 먼저 선택, 그 후 3초 대기 후 캡처.
  const onDelayedFullscreen = (): void => {
    guardCapture().then((ok) => {
      if (!ok) return;
      const cursor = screen.getCursorScreenPoint();
      countdownWindow.show(HOVER_DELAY_MS / 1000, cursor);
      setTimeout(() => {
        countdownWindow.close();
        const newCursor = screen.getCursorScreenPoint();
        const d = screen.getDisplayNearestPoint(newCursor);
        runCapture('전체화면 캡처', () =>
          captureRegion({ x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height }),
        );
      }, HOVER_DELAY_MS);
    });
  };

  const onDelayedRegion = (): void => {
    guardCapture().then((ok) => {
      if (!ok) return;
      selectionOverlay.show().then(
        (result) => {
          if (result.kind !== 'selected') return;
          const cursor = screen.getCursorScreenPoint();
          countdownWindow.show(HOVER_DELAY_MS / 1000, cursor);
          setTimeout(() => {
            countdownWindow.close();
            const { windowId, ...rect } = result.rect;
            runCapture('영역 캡처', () =>
              // Dock 아이템은 가짜 음수 ID — screencapture -l 가 invalid 처리하므로
              // rect 기반 captureRegion 으로 fallback. 일반 윈도우(양수 ID) 는 그대로.
              windowId !== undefined && windowId > 0
                ? captureWindowById(windowId)
                : captureRegion(rect),
            );
          }, HOVER_DELAY_MS);
        },
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[asis] 지연 영역 선택 실패', err);
          notifyError(`영역 선택 실패: ${message}`);
        },
      );
    });
  };
  const onDisableClickThrough = (): void => {
    pinWindow.disableAllClickThrough();
    if (pinWindow.count() > 0) {
      notifyInfo(`핀 ${pinWindow.count()}개 click-through 해제`);
    }
  };
  const onCloseAllPins = (): void => {
    const n = pinWindow.count();
    pinWindow.closeAll();
    if (n > 0) notifyInfo(`핀 ${n}개 닫음`);
  };
  const onGif = (): void => {
    handleGif();
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
    onClipboardPin,
    onSettings,
    onHistory,
    onOpenPermissions,
  };
  trayManager.start(handlers);
  shortcutManager.start(handlers);
  editorWindow.prewarm();
  selectionOverlay.prewarm();

  // 앱 시작 직후 권한 상태 확인 — 거부/미설정 시 안내 다이얼로그 표시.
  checkPermissionsOnLaunch().catch((err: unknown) => {
    console.error('[asis] permission check failed', err);
  });

  // 업데이트 체크 — 앱 시작 5초 후 첫 체크, 이후 3일마다 반복.
  // electron-updater 가 백그라운드 다운로드 → 완료 후 설치 확인 다이얼로그를 처리한다.
  const CHECK_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3일
  setTimeout(() => checkForUpdates(), 5000);
  setInterval(() => checkForUpdates(), CHECK_INTERVAL_MS);
}).catch((err: unknown) => {
  // app.whenReady() 체인의 미처리 에러가 조용히 삼켜지는 걸 방지.
  console.error('[asis] app initialization failed', err);
  dialog.showErrorBox('ASIS 시작 실패', String(err instanceof Error ? err.message : err));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  shortcutManager.stop();
  trayManager.stop();
  selectionOverlay.stop();
  editorWindow.stop();
  pinWindow.closeAll();
  recorderWindow.stop();
  settingsWindow.stop();
  historyWindow.stop();
});
