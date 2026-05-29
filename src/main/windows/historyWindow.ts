import type { BrowserWindowConstructorOptions } from 'electron';
import { SingletonWindowManager } from './common';

/**
 * 캡처 히스토리 윈도우 lifecycle 관리.
 *
 * IPC 채널(history:list/copy/pin) 은 main/index.ts 에서 영속 등록.
 */
export class HistoryWindowManager extends SingletonWindowManager {
  protected readonly windowOptions: BrowserWindowConstructorOptions = {
    width: 720,
    height: 520,
    title: '캡처 히스토리',
  };
  protected readonly htmlPath = '../renderer/history/index.html';
  protected readonly logLabel = 'historyWindow';
}
