import { Tray, Menu, app, nativeImage } from 'electron';
import iconPath from '../../resources/trayTemplate.png?asset';

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
};

export class TrayManager {
  private tray: Tray | null = null;

  start(handlers: TrayMenuHandlers): void {
    if (this.tray) {
      // null-safety.md — 같은 인스턴스 재시작은 silent allow 가 아니라 명시 throw.
      throw new Error('TrayManager.start() called twice — already running');
    }

    const image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
      throw new Error(`Tray icon failed to load from: ${iconPath}`);
    }
    // macOS 메뉴바의 다크/라이트 모드 자동 대응을 위해 template image 로 마킹.
    // resources/trayTemplate.png 는 monochrome + alpha 전용 (qlmanage 로 SVG → 22x22 변환).
    // 파일명에 "Template" suffix 가 있어 macOS 가 자동으로도 인식하지만,
    // 이중 안전을 위해 명시 호출도 유지한다.
    image.setTemplateImage(true);

    this.tray = new Tray(image);
    this.tray.setToolTip('ASIS — 캡처·어노테이션');
    this.tray.setContextMenu(this.buildContextMenu(handlers));
  }

  stop(): void {
    if (!this.tray) {
      return;
    }
    this.tray.destroy();
    this.tray = null;
  }

  private buildContextMenu(handlers: TrayMenuHandlers): Menu {
    return Menu.buildFromTemplate([
      // 헤더 — 비활성 라벨로 앱 정체성 표시 (CleanShot/Shottr 결).
      { label: 'ASIS', enabled: false },
      { type: 'separator' },

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

      { type: 'separator' },

      // 미구현 항목 — 향후 phase 에서 활성화.
      { label: '환경설정…', enabled: false },

      { type: 'separator' },

      {
        label: '종료',
        accelerator: 'CommandOrControl+Q',
        click: () => app.quit(),
      },
    ]);
  }
}
