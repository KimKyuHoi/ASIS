import { app, Notification } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { TrayManager } from './tray';
import { ShortcutManager } from './shortcuts';
import {
  captureFullscreen,
  captureRegion,
  captureWindow,
  type CaptureResult,
} from './capture';
import { SelectionOverlayManager } from './windows/selectionOverlay';
import { EditorWindowManager } from './windows/editorWindow';
import { PinWindowManager } from './windows/pinWindow';

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
  capture().then(
    (result) => {
      if (result.kind !== 'success') return;
      editorWindow.show(result.path).then(
        (editorResult) => {
          if (editorResult.kind === 'copied') {
            notifyInfo(`${label} — 클립보드에 복사되었습니다`);
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
      notifyError(
        `${label} 실패: ${message}\n시스템 설정 → 개인정보 보호 및 보안 → 화면 기록에서 ASIS 권한을 확인해 주세요.`,
      );
    },
  );
};

const handleRegionCapture = (): void => {
  selectionOverlay.show().then(
    (result) => {
      if (result.kind === 'selected') {
        handleCapture('영역 캡처', () => captureRegion(result.rect));
      }
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[asis] 영역 선택 오버레이 실패', err);
      notifyError(`영역 선택 실패: ${message}`);
    },
  );
};

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pinkfong.asis');

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

  const handlers = {
    onFullscreen,
    onWindow,
    onRegion,
    onDisableClickThrough,
    onCloseAllPins,
  };
  trayManager.start(handlers);
  shortcutManager.start(handlers);
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
});
