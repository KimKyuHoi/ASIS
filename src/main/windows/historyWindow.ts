import type { BrowserWindowConstructorOptions } from 'electron';
import { SingletonWindowManager } from './common';
import { tMain } from '../i18n/strings';

/**
 * 캡처 히스토리 윈도우 lifecycle 관리.
 *
 * IPC 채널(history:list/copy/pin) 은 main/index.ts 에서 영속 등록.
 */
export class HistoryWindowManager extends SingletonWindowManager {
  // title 을 show() 시점 언어로 뽑기 위해 getter — 클래스 필드로 두면 모듈 로드
  // 시점의 언어로 굳는다.
  protected get windowOptions(): BrowserWindowConstructorOptions {
    return {
      width: 720,
      height: 520,
      title: tMain().windows.historyTitle,
    };
  }
  protected readonly page = 'history';
  protected readonly logLabel = 'historyWindow';
}
