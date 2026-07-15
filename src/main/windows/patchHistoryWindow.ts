import type { BrowserWindowConstructorOptions } from 'electron';
import { SingletonWindowManager } from './common';
import { tMain } from '../i18n/strings';

/**
 * 변경 이력(패치 노트) 윈도우 lifecycle 관리.
 *
 * IPC 채널(patch-history:list) 은 main/index.ts 에서 영속 등록 —
 * history/settings 와 동일한 "IPC 는 main, 윈도우는 표시만" 패턴.
 */
export class PatchHistoryWindowManager extends SingletonWindowManager {
  // title 을 show() 시점 언어로 뽑기 위해 getter (historyWindow 참고).
  protected get windowOptions(): BrowserWindowConstructorOptions {
    return {
      width: 640,
      height: 640,
      title: tMain().windows.patchHistoryTitle,
    };
  }
  protected readonly page = 'patch-history';
  protected readonly logLabel = 'patchHistoryWindow';
}
