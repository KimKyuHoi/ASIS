import { Tray, Menu, app, nativeImage, shell } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import devIconPath from '../../resources/trayTemplate.png?asset';

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
  onSequenceGif: () => void;
  onVideoGif: () => void;
  onClipboardPin: () => void;
  onSettings: () => void;
  onHistory: () => void;
  onOpenPermissions: () => void;
};


type UpdateState =
  | { kind: 'none' } |
  { kind: 'downloading'; version: string } |
  { kind: 'ready'; version: string; pkgPath: string };

export class TrayManager {
  private tray: Tray | null = null;
  private handlers: TrayMenuHandlers | null = null;
  private updateState: UpdateState = { kind: 'none' };

  start(handlers: TrayMenuHandlers): void {
    if (this.tray) {
      // null-safety.md — 같은 인스턴스 재시작은 silent allow 가 아니라 명시 throw.
      throw new Error('TrayManager.start() called twice — already running');
    }

    const image = nativeImage.createFromPath(resolveIconPath());
    if (image.isEmpty()) {
      throw new Error(`Tray icon failed to load from: ${resolveIconPath()}`);
    }
    // macOS 메뉴바의 다크/라이트 모드 자동 대응을 위해 template image 로 마킹.
    // resources/trayTemplate.png 는 monochrome + alpha 전용 (qlmanage 로 SVG → 22x22 변환).
    // 파일명에 "Template" suffix 가 있어 macOS 가 자동으로도 인식하지만,
    // 이중 안전을 위해 명시 호출도 유지한다.
    image.setTemplateImage(true);

    this.handlers = handlers;
    this.tray = new Tray(image);
    this.tray.setToolTip('ASIS — 캡처·어노테이션');
    this.tray.setContextMenu(this.buildContextMenu(handlers));
  }

  /** 새 버전 발견 직후 — 다운로드 중 상태로 메뉴 갱신. */
  setUpdateDownloading(version: string): void {
    if (!this.tray || !this.handlers) return;
    this.updateState = { kind: 'downloading', version };
    this.tray.setContextMenu(this.buildContextMenu(this.handlers));
  }

  /** 다운로드 완료 — 설치 준비 상태로 메뉴 갱신. */
  setUpdateReady(version: string, pkgPath: string): void {
    if (!this.tray || !this.handlers) return;
    this.updateState = { kind: 'ready', version, pkgPath };
    this.tray.setContextMenu(this.buildContextMenu(this.handlers));
  }

  stop(): void {
    if (!this.tray) {
      return;
    }
    this.tray.destroy();
    this.tray = null;
  }

  private buildContextMenu(handlers: TrayMenuHandlers): Menu {
    const state = this.updateState;
    let updateItems: Electron.MenuItemConstructorOptions[];
    if (state.kind === 'downloading') {
      updateItems = [
        { label: `새 버전 ${state.version} 다운로드 중…`, enabled: false },
        { type: 'separator' },
      ];
    } else if (state.kind === 'ready') {
      const { pkgPath, version } = state;
      updateItems = [
        {
          label: `업데이트 ${version} 설치하기`,
          click: () => { shell.openPath(pkgPath).catch(() => {}); },
        },
        { type: 'separator' },
      ];
    } else {
      updateItems = [];
    }

    return Menu.buildFromTemplate([
      // 헤더 — 비활성 라벨로 앱 정체성 표시 (CleanShot/Shottr 결).
      { label: 'ASIS', enabled: false },
      { type: 'separator' },
      ...updateItems,

      // 캡처 항목 — accelerator 옵션으로 macOS 가 자동 ⌘⇧F 우측 정렬·표시.
      // 실제 글로벌 단축키 binding 은 ShortcutManager 가 별도 처리하므로
      // 여기 accelerator 는 *시각 표시 + 메뉴 열린 동안의 키보드 navigation* 전용.
      {
        label: '전체 화면 캡처',
        accelerator: 'CommandOrControl+Shift+F',
        click: handlers.onFullscreen,
      },
      {
        label: '윈도우 캡처',
        accelerator: 'CommandOrControl+Shift+W',
        click: handlers.onWindow,
      },
      {
        label: '영역 캡처',
        accelerator: 'CommandOrControl+Shift+A',
        click: handlers.onRegion,
      },
      {
        label: '지연 전체화면 캡처 (3초)',
        click: handlers.onDelayedFullscreen,
      },
      {
        label: '지연 영역 캡처 (3초)',
        click: handlers.onDelayedRegion,
      },

      { type: 'separator' },

      // GIF — 영역 선택 후 시퀀스 캡처 / 영상 녹화 → GIF 인코딩.
      {
        label: '시퀀스 GIF 녹화…',
        accelerator: 'CommandOrControl+Shift+G',
        click: handlers.onSequenceGif,
      },
      {
        label: '영상 GIF 녹화…',
        accelerator: 'CommandOrControl+Shift+Alt+G',
        click: handlers.onVideoGif,
      },
      // 클립보드 이미지 → 바로 Pin (Snipaste F3 결).
      {
        label: '클립보드를 핀으로',
        accelerator: 'CommandOrControl+Shift+V',
        click: handlers.onClipboardPin,
      },

      { type: 'separator' },

      // 핀 관리 — click-through 활성 핀은 마우스/키보드로 잡을 수 없어
      // 글로벌 단축키 또는 이 메뉴가 유일한 회수 경로.
      {
        label: '모든 핀 click-through 해제',
        accelerator: 'CommandOrControl+Shift+X',
        click: handlers.onDisableClickThrough,
      },
      {
        label: '모든 핀 닫기',
        click: handlers.onCloseAllPins,
      },

      { type: 'separator' },

      { label: '캡처 히스토리', click: handlers.onHistory },
      { label: '환경설정…', click: handlers.onSettings },
      { label: '권한 설정…', click: handlers.onOpenPermissions },

      { type: 'separator' },

      {
        label: '종료',
        accelerator: 'CommandOrControl+Q',
        click: () => app.quit(),
      },
    ]);
  }
}
