import type { BrowserWindowConstructorOptions } from 'electron';
import { SingletonWindowManager } from './common';

/**
 * 변경 이력(패치 노트) 윈도우 lifecycle 관리.
 *
 * IPC 채널(patch-history:list) 은 main/index.ts 에서 영속 등록 —
 * history/settings 와 동일한 "IPC 는 main, 윈도우는 표시만" 패턴.
 */
export class PatchHistoryWindowManager extends SingletonWindowManager {
  protected readonly windowOptions: BrowserWindowConstructorOptions = {
    width: 640,
    height: 640,
    title: '변경 이력',
  };
  protected readonly page = 'patch-history';
  protected readonly logLabel = 'patchHistoryWindow';
}
