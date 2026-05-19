import { app, clipboard, dialog, ipcMain, nativeImage, Notification, screen } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { electronApp, optimizer } from '@electron-toolkit/utils';
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
import { fetchLatestTag, isNewer, downloadUpdatePkg, installPkg } from './updateChecker';

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
          handleCapture('영역 캡처', () =>
            windowId !== undefined ? captureWindowById(windowId) : captureRegion(rect),
          );
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

const handleRecorderGif = (mode: 'sequence' | 'video', label: string): void => {
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
        const showPromise = recorderWindow.show(selResult.rect, mode);
        if (recorderWindow.isHidden()) {
          notifyInfo(`${label} 녹화 중 — 단축키로 정지`);
        }
        showPromise.then(
          (recResult) => {
            if (recResult.kind === 'saved') {
              notifyInfo(`${label} 저장 — ${recResult.path}`);
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
      // selectionOverlay 실패 분기.
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[asis] ${label} 영역 선택 실패`, err);
        notifyError(`${label} 시작 실패: ${message}`);
      },
    );
  });
};

const handleSequenceGif = (): void => handleRecorderGif('sequence', '시퀀스 GIF');
const handleVideoGif = (): void => handleRecorderGif('video', '영상 GIF');

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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pinkfong.asis');

  // 업데이트 완료 감지 — lastLaunchedVersion 이 현재보다 낮으면 방금 업데이트된 것.
  const current = app.getVersion();
  const lastVersion = settingsStore.get('lastLaunchedVersion');
  if (lastVersion && isNewer(current, lastVersion)) {
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
      new Notification({
        title: 'ASIS',
        body: `마우스를 원하는 위치에 두세요 — ${HOVER_DELAY_MS / 1000}초 후 전체화면을 캡처합니다.`,
      }).show();
      setTimeout(() => {
        const cursor = screen.getCursorScreenPoint();
        const d = screen.getDisplayNearestPoint(cursor);
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
          new Notification({
            title: 'ASIS',
            body: `마우스를 원하는 위치에 두세요 — ${HOVER_DELAY_MS / 1000}초 후 캡처합니다.`,
          }).show();
          setTimeout(() => {
            const { windowId, ...rect } = result.rect;
            runCapture('영역 캡처', () =>
              windowId !== undefined ? captureWindowById(windowId) : captureRegion(rect),
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
  const onSequenceGif = (): void => {
    handleSequenceGif();
  };
  const onVideoGif = (): void => {
    handleVideoGif();
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
    onSequenceGif,
    onVideoGif,
    onClipboardPin,
    onSettings,
    onHistory,
    onOpenPermissions,
  };
  trayManager.start(handlers);
  shortcutManager.start(handlers);
  editorWindow.prewarm();

  // 앱 시작 직후 권한 상태 확인 — 거부/미설정 시 안내 다이얼로그 표시.
  checkPermissionsOnLaunch().catch((err: unknown) => {
    console.error('[asis] permission check failed', err);
  });

  // 업데이트 체크 — 앱 시작 5초 후 첫 체크, 이후 3일마다 반복.
  // 새 버전이 있으면 백그라운드 다운로드 → 알림 → 클릭 시 자동 설치.
  const CHECK_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3일
  let pendingUpdateVersion: string | null = null;

  const checkAndNotifyUpdate = (): void => {
    const current = app.getVersion();
    fetchLatestTag().then((latest) => {
      if (!latest || !isNewer(latest, current)) return;
      // 이미 같은 버전 다운로드/알림이 진행 중이면 중복 실행 방지
      if (pendingUpdateVersion === latest) return;
      pendingUpdateVersion = latest;

      downloadUpdatePkg(latest).then((pkgPath) => {
        const notification = new Notification({
          title: `ASIS ${latest} 업데이트 준비 완료`,
          body: '클릭하면 비밀번호 한 번으로 자동 설치됩니다',
        });
        notification.on('click', () => {
          dialog.showMessageBox({
            type: 'info',
            title: `ASIS ${latest} 업데이트`,
            message: '지금 설치하고 재시작하시겠어요?',
            detail: '비밀번호를 한 번 입력하면 설치 후 자동으로 재시작합니다.',
            buttons: ['지금 설치', '나중에'],
            defaultId: 0,
            cancelId: 1,
          }).then((result) => {
            if (result.response !== 0) return;
            installPkg(pkgPath).then(() => {
              app.relaunch();
              // exit(0) — before-quit 이벤트 체인을 건너뛰고 즉시 종료.
              // quit() 은 윈도우 close 핸들러를 거치므로 블록될 수 있다.
              setTimeout(() => app.exit(0), 300);
            }).catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg !== 'canceled') {
                notifyError(`업데이트 설치 실패: ${msg}`);
              }
            });
          }).catch(() => {});
        });
        notification.show();
      }).catch((err: unknown) => {
        pendingUpdateVersion = null;
        console.warn('[asis] update download failed', err);
      });
    }).catch((err: unknown) => {
      console.warn('[asis] update check failed', err);
    });
  };

  setTimeout(checkAndNotifyUpdate, 5000);
  setInterval(checkAndNotifyUpdate, CHECK_INTERVAL_MS);
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
