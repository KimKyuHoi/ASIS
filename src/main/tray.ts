import { Tray, Menu, app, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import devIconPath from '../../resources/trayTemplate.png?asset';
import { tMain } from './i18n/strings';

// extraResources 경로가 실제로 존재하면 사용, 아니면 ?asset 경로(dev 또는 asarUnpack fallback).
function resolveIconPath(): string {
  const resourcesPath = join(process.resourcesPath, 'trayTemplate.png');
  return existsSync(resourcesPath) ? resourcesPath : devIconPath;
}

/**
 * 메뉴바 트레이 아이콘 + 컨텍스트 메뉴 lifecycle 관리.
 *
 * .claude/rules/side-effects.md 의 Rule 3 — React lifecycle 과 무관한 객체는
 * 모듈 스코프 Class 로 캡슐화한다. Tray 는 그 정확한 예시 (룰 본문 인용 자리).
 */
export type TrayMenuHandlers = {
  onFullscreen: () => void;
  onWindow: () => void;
  onRegion: () => void;
  onDelayedFullscreen: () => void;
  onDelayedRegion: () => void;
  onDisableClickThrough: () => void;
  onCloseAllPins: () => void;
  onGif: () => void;
  onVideo: () => void;
  onOcr: () => void;
  onRuler: () => void;
  onScrollCapture: () => void;
  onStepGuide: () => void;
  onTimeMachineToggle: () => void;
  onTimeMachineSave: () => void;
  onClipboardPin: () => void;
  onSettings: () => void;
  onHistory: () => void;
  onPatchHistory: () => void;
  onOpenPermissions: () => void;
};

export class TrayManager {
  private tray: Tray | null = null;
  private handlers: TrayMenuHandlers | null = null;

  start(handlers: TrayMenuHandlers): void {
    if (this.tray) {
      // null-safety.md — 같은 인스턴스 재시작은 silent allow 가 아니라 명시 throw.
      throw new Error('TrayManager.start() called twice — already running');
    }
    this.handlers = handlers;

    const image = nativeImage.createFromPath(resolveIconPath());
    if (image.isEmpty()) {
      throw new Error(`Tray icon failed to load from: ${resolveIconPath()}`);
    }
    // macOS 메뉴바의 다크/라이트 모드 자동 대응을 위해 template image 로 마킹.
    // resources/trayTemplate.png 는 monochrome + alpha 전용 (qlmanage 로 SVG → 22x22 변환).
    // 파일명에 "Template" suffix 가 있어 macOS 가 자동으로도 인식하지만,
    // 이중 안전을 위해 명시 호출도 유지한다.
    image.setTemplateImage(true);

    this.tray = new Tray(image);
    this.tray.setToolTip(tMain().tray.tooltip);
    this.tray.setContextMenu(this.buildContextMenu(handlers));
  }

  stop(): void {
    if (!this.tray) {
      return;
    }
    this.tray.destroy();
    this.tray = null;
    this.handlers = null;
  }

  /** 언어 변경 시 툴팁·컨텍스트 메뉴 재빌드. 트레이 미실행이면 no-op. */
  refresh(): void {
    if (!this.tray || !this.handlers) return;
    this.tray.setToolTip(tMain().tray.tooltip);
    this.tray.setContextMenu(this.buildContextMenu(this.handlers));
  }

  private buildContextMenu(handlers: TrayMenuHandlers): Menu {
    const t = tMain().tray;
    return Menu.buildFromTemplate([
      // 헤더 — 비활성 라벨로 앱 정체성 표시 (CleanShot/Shottr 결).
      { label: 'ASIS', enabled: false },
      { type: 'separator' },

      // 캡처 항목 — accelerator 옵션으로 macOS 가 자동 ⌘⇧F 우측 정렬·표시.
      // 실제 글로벌 단축키 binding 은 ShortcutManager 가 별도 처리하므로
      // 여기 accelerator 는 *시각 표시 + 메뉴 열린 동안의 키보드 navigation* 전용.
      {
        label: t.fullscreen,
        accelerator: 'CommandOrControl+Shift+F',
        click: handlers.onFullscreen,
      },
      {
        label: t.window,
        accelerator: 'CommandOrControl+Shift+W',
        click: handlers.onWindow,
      },
      {
        label: t.region,
        accelerator: 'CommandOrControl+Shift+A',
        click: handlers.onRegion,
      },
      {
        label: t.delayedFullscreen,
        accelerator: 'CommandOrControl+Shift+D',
        click: handlers.onDelayedFullscreen,
      },
      {
        label: t.delayedRegion,
        accelerator: 'CommandOrControl+Shift+Alt+D',
        click: handlers.onDelayedRegion,
      },
      {
        label: t.ocr,
        accelerator: 'CommandOrControl+Shift+O',
        click: handlers.onOcr,
      },
      {
        label: t.ruler,
        accelerator: 'CommandOrControl+Shift+L',
        click: handlers.onRuler,
      },
      {
        label: t.scrollCapture,
        accelerator: 'CommandOrControl+Shift+J',
        click: handlers.onScrollCapture,
      },

      { type: 'separator' },

      {
        label: t.video,
        accelerator: 'CommandOrControl+Shift+E',
        click: handlers.onVideo,
      },
      {
        label: t.gif,
        accelerator: 'CommandOrControl+Shift+G',
        click: handlers.onGif,
      },
      {
        label: t.stepGuide,
        accelerator: 'CommandOrControl+Shift+U',
        click: handlers.onStepGuide,
      },
      {
        label: t.timeMachineToggle,
        accelerator: 'CommandOrControl+Shift+T',
        click: handlers.onTimeMachineToggle,
      },
      {
        label: t.timeMachineSave,
        accelerator: 'CommandOrControl+Shift+S',
        click: handlers.onTimeMachineSave,
      },
      // 클립보드 이미지 → 바로 Pin (Snipaste F3 결).
      {
        label: t.clipboardPin,
        accelerator: 'CommandOrControl+Shift+V',
        click: handlers.onClipboardPin,
      },

      { type: 'separator' },

      // 핀 관리 — click-through 활성 핀은 마우스/키보드로 잡을 수 없어
      // 글로벌 단축키 또는 이 메뉴가 유일한 회수 경로.
      {
        label: t.disableClickThrough,
        accelerator: 'CommandOrControl+Shift+X',
        click: handlers.onDisableClickThrough,
      },
      {
        label: t.closeAllPins,
        click: handlers.onCloseAllPins,
      },

      { type: 'separator' },

      { label: t.history, click: handlers.onHistory },
      { label: t.patchHistory, click: handlers.onPatchHistory },
      { label: t.settings, click: handlers.onSettings },
      { label: t.permissions, click: handlers.onOpenPermissions },

      { type: 'separator' },

      {
        label: t.quit,
        accelerator: 'CommandOrControl+Q',
        click: () => app.quit(),
      },
    ]);
  }
}
