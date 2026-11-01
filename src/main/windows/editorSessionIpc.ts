import { clipboard, ipcMain, nativeImage, type BrowserWindow } from 'electron';
import { addEntry, checkedProject } from '../captureHistory';
import { saveToFolder, saveWithDialog } from './editorSave';

/**
 * 에디터 한 세션 동안 유효한 IPC 핸들러 — 복사·취소·핀·저장. editorWindow.ts 가 길어져 분리했다.
 * 세션이 끝나면 EditorWindowManager.endSession 이 unregisterSessionHandlers 로 해제한다.
 */

export type EditorResult =
  | { kind: 'copied' } |
  { kind: 'canceled' };

const CHANNEL_COPY = 'editor:copy';
const CHANNEL_CANCEL = 'editor:cancel';
const CHANNEL_PIN = 'editor:pin';
const CHANNEL_SAVE = 'editor:save';
const CHANNEL_SAVE_FOLDER = 'editor:save-folder';

export type SessionContext = {
  win: BrowserWindow;
  settle: (result: EditorResult) => void;
  /** 히스토리 항목 키 — 한 세션에서 핀·복사를 거듭해도 항목 하나를 바꾼다(captureHistory). */
  sessionKey: string;
  getPinHandler: () => ((dataUrl: string, w: number, h: number) => void) | null;
};

/** 한 편집 세션 동안 유효한 IPC 핸들러 — 해제는 EditorWindowManager.endSession. */
export function registerSessionHandlers(ctx: SessionContext): void {
  // project: 다시 편집용(주석 없는 배경 + 도형). 검증 실패면 히스토리에 편집본 없이 남긴다 —
  // 복사 자체는 사용자가 원한 동작이라 막지 않는다.
  ipcMain.handleOnce(CHANNEL_COPY, (_event, dataUrl: string, project: unknown) => {
    const composed = nativeImage.createFromDataURL(dataUrl);
    if (composed.isEmpty()) {
      throw new Error('editor: empty NativeImage from dataURL');
    }
    clipboard.writeImage(composed);
    // 크기는 결과 이미지에서 — 크롭하면 캡처 원본 크기와 달라진다.
    addEntry({
      dataUrl,
      size: composed.getSize(),
      project: checkedProject(project),
      sessionKey: ctx.sessionKey,
    });
    ctx.settle({ kind: 'copied' });
  });

  ipcMain.once(CHANNEL_CANCEL, () => {
    ctx.settle({ kind: 'canceled' });
  });

  // preload 가 (dataUrl, w, h, project) 4개를 보낸다 — max-params(3) 때문에 rest 튜플로 받는다.
  // w·h 는 결과 PNG 의 물리 픽셀 (pinWindow.pin 이 scaleFactor 로 나눈다).
  ipcMain.handle(
    CHANNEL_PIN,
    (_event, ...[dataUrl, w, h, project]: [string, number, number, unknown]) => {
      const pinHandler = ctx.getPinHandler();
      if (!pinHandler) {
        throw new Error('editor: pinHandler 미설정 — main 부트스트랩 확인');
      }
      pinHandler(dataUrl, w, h);
      addEntry({
        dataUrl,
        size: { width: w, height: h },
        project: checkedProject(project),
        sessionKey: ctx.sessionKey,
      });
    },
  );

  ipcMain.handle(CHANNEL_SAVE, (_event, dataUrl: string) => saveWithDialog(ctx.win, dataUrl));
  ipcMain.handle(CHANNEL_SAVE_FOLDER, (_event, dataUrl: string) => saveToFolder(dataUrl));
}

export function unregisterSessionHandlers(): void {
  ipcMain.removeHandler(CHANNEL_COPY);
  ipcMain.removeHandler(CHANNEL_PIN);
  ipcMain.removeHandler(CHANNEL_SAVE);
  ipcMain.removeHandler(CHANNEL_SAVE_FOLDER);
  ipcMain.removeAllListeners(CHANNEL_CANCEL);
}
