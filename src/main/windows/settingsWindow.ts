import type { BrowserWindowConstructorOptions } from 'electron';
import { SingletonWindowManager } from './common';
import { tMain } from '../i18n/strings';

/**
 * 환경설정 윈도우 lifecycle 관리.
 *
 * 싱글턴 — 이미 열려있으면 focus 만 한다.
 * IPC 채널(settings:get/set) 은 main process 에서 영속 등록하므로 여기서 관리 안 함.
 */
export class SettingsWindowManager extends SingletonWindowManager {
  // title 을 show() 시점 언어로 뽑기 위해 getter (historyWindow 참고).
  protected get windowOptions(): BrowserWindowConstructorOptions {
    return {
      width: 560,
      height: 600,
      title: tMain().windows.settingsTitle,
      resizable: false,
      minimizable: true,
      maximizable: false,
    };
  }
  protected readonly page = 'settings';
  protected readonly logLabel = 'settingsWindow';
}
