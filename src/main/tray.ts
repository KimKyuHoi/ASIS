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

/**
 * 메뉴를 빌드할 때마다 읽는 동적 상태. 라벨/표시가 앱 상태에 따라 달라지는
 * 항목은 여기 getter 로 노출하고, 상태가 바뀌는 쪽에서 refresh() 를 불러준다.
 */
export type TrayMenuState = {
  /** 타임머신이 지금 녹화 중인지 — 시작/정지 라벨·메뉴바 타이틀 전환용. */
  isTimeMachineRunning: () => boolean;
  /**
   * 저장 진행 단계. 저장해도 녹화는 계속되므로 running 과 별개 축이다.
   * 'saving' = concat 진행 중, 'saved' = 완료 직후 잠깐(호출측이 타이머로 해제),
   * null = 저장 흐름 아님.
   */
  timeMachineSavePhase: () => 'saving' | 'saved' | null;
  /** 유지 중인 버퍼 길이(초) — 상태 헤더에 "최근 N초 유지" 로 표시. */
  timeMachineBufferSeconds: () => number;
};

/**
 * 타임머신 상태 헤더 문구 — 저장 단계가 실행 여부보다 우선한다
 * (저장 중에는 "녹화 중"보다 "저장 중"이 사용자가 기다리는 정보다).
 */
function timeMachineStatusLabel(state: TrayMenuState): string {
  const t = tMain().tray;
  const phase = state.timeMachineSavePhase();
  if (phase === 'saving') return t.timeMachineStatusSaving;
  if (phase === 'saved') return t.timeMachineStatusSaved;
  if (state.isTimeMachineRunning()) {
    return t.timeMachineStatusRecording(state.timeMachineBufferSeconds());
  }
  return t.timeMachineStatusIdle;
}

/*
 * 메뉴바 아이콘 옆 텍스트(Tray.setTitle) 는 쓰지 않는다.
 * 상태 표시가 필요하긴 하지만, 메뉴바는 이미 상태 아이콘으로 포화 상태이고
 * 왼쪽 앱 메뉴가 길어지면 오른쪽부터 잘려 나간다 — 정작 봐야 할 때 안 보인다.
 * 상시 표시는 화면 위 알약(timeMachineHudWindow) 이 맡고, 트레이는 메뉴를 열었을
 * 때의 상태 헤더만 담당한다.
 */

export class TrayManager {
  private tray: Tray | null = null;
  private handlers: TrayMenuHandlers | null = null;
  private state: TrayMenuState | null = null;

  start(handlers: TrayMenuHandlers, state: TrayMenuState): void {
    if (this.tray) {
      // null-safety.md — 같은 인스턴스 재시작은 silent allow 가 아니라 명시 throw.
      throw new Error('TrayManager.start() called twice — already running');
    }
    this.handlers = handlers;
    this.state = state;

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
    this.tray.setContextMenu(this.buildContextMenu(handlers, state));
  }

  stop(): void {
    if (!this.tray) {
      return;
    }
    this.tray.destroy();
    this.tray = null;
    this.handlers = null;
    this.state = null;
  }

  /** 언어·앱 상태(타임머신 녹화 등) 변경 시 툴팁·컨텍스트 메뉴 재빌드. 트레이 미실행이면 no-op. */
  refresh(): void {
    if (!this.tray || !this.handlers || !this.state) return;
    this.tray.setToolTip(tMain().tray.tooltip);
    this.tray.setContextMenu(this.buildContextMenu(this.handlers, this.state));
  }

  private buildContextMenu(handlers: TrayMenuHandlers, state: TrayMenuState): Menu {
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
      { type: 'separator' },

      // 타임머신 블록 — 메뉴를 열었을 때 "지금 켜져 있나?" 를 맨 위 헤더가 답한다.
      // 경과 시간은 넣지 않는다: setContextMenu 로 세팅된 메뉴는 열릴 때 자동
      // 재빌드되지 않아 시:분:초를 넣으면 멈춘 값이 보인다 (버퍼 길이는 불변이라 안전).
      { label: timeMachineStatusLabel(state), enabled: false },
      // 빌드 시점의 실행 상태로 시작/정지 라벨을 전환한다. 상태가 바뀌는 쪽
      // (토글 완료·조기 사망)에서 refresh() 를 불러 메뉴를 재빌드해야 반영된다.
      {
        label: state.isTimeMachineRunning() ? t.timeMachineStop : t.timeMachineStart,
        accelerator: 'CommandOrControl+Shift+T',
        click: handlers.onTimeMachineToggle,
      },
      {
        label: t.timeMachineSave,
        accelerator: 'CommandOrControl+Shift+S',
        // 미실행 상태의 저장은 "실행 중이 아닙니다" 알림만 띄우는 헛동작 —
        // 누를 수 없게 해서 상태를 메뉴 자체로 드러낸다.
        enabled: state.isTimeMachineRunning(),
        click: handlers.onTimeMachineSave,
      },

      { type: 'separator' },

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
