import { app, clipboard, dialog, ipcMain, nativeImage, Notification } from 'electron';
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
  captureFullscreen,
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
import { fetchLatestTag, isNewer } from './updateChecker';

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

/**
 * 캡처 → 에디터 → 클립보드 흐름.
 *  1) capture() 로 PNG path 받음 (canceled 면 silent 종료)
 *  2) editorWindow.show(path) 로 어노테이션 에디터 띄움
 *  3) 사용자 "복사" → kind: 'copied' → 알림
 *     사용자 "취소"/ESC → kind: 'canceled' → silent
 */
const handleCapture = (
  label: string,
  capture: () => Promise<CaptureResult>,
): void => {
  guardCapture().then((ok) => {
    if (!ok) return;
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
    handleCapture('전체화면 캡처', captureFullscreen);
  };
  const onWindow = (): void => {
    handleCapture('윈도우 캡처', captureWindow);
  };
  const onRegion = (): void => {
    handleRegionCapture();
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

  // 업데이트 체크 — 네트워크 지연이 있으므로 5초 뒤 백그라운드 실행.
  setTimeout(() => {
    const current = app.getVersion();
    fetchLatestTag().then((latest) => {
      if (latest && isNewer(latest, current)) {
        notifyInfo(`새 버전 ${latest} 사용 가능 — 메뉴바에서 업데이트`);
        trayManager.setUpdateAvailable(latest);
      }
    }).catch((err: unknown) => {
      console.warn('[asis] update check failed', err);
    });
  }, 5000);
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
