import { dialog, Notification, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { copyToSaveFolder, removeFile } from './exportTarget';
import { tGifStudio } from './strings';

/**
 * 열린 창의 미디어를 바꾸기 전 확인 — 교체하면 cleanupSession 이 현재 녹화 tmp 를 지우고
 * 진행 중인 내보내기를 취소하므로, 잃을 것이 있을 때만 묻는다.
 * (녹화 후 동작이 'editor' 일 때 편집 중에 다시 녹화하면 같은 창으로 들어온다.)
 *
 * @returns true = 교체 진행
 */
export async function confirmReplace(
  win: BrowserWindow,
  incomingIsRecording: boolean,
): Promise<boolean> {
  const t = tGifStudio();
  const detail = incomingIsRecording
    ? `${t.replaceDetail}\n${t.replaceDetailKeepNew}`
    : t.replaceDetail;
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    message: t.replaceMessage,
    detail,
    buttons: [t.replaceOpen, t.replaceKeep],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
}

/**
 * 교체를 거절했을 때 새 녹화 tmp 를 버리지 않고 저장 폴더로 옮긴다.
 * @returns 저장된 경로
 */
export async function keepRecording(tmpPath: string): Promise<string> {
  const target = await copyToSaveFolder(tmpPath);
  await removeFile(tmpPath);
  return target;
}

/**
 * 닫기 확인 시트 — [저장하지 않고 닫기] 면 true. ESC 는 [취소].
 * 비동기 시트라 떠 있는 동안에도 main 이벤트 루프(녹화 알약 IPC·정지 단축키)가 돈다.
 */
export async function confirmDiscard(win: BrowserWindow): Promise<boolean> {
  const t = tGifStudio();
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    message: t.closeConfirmTitle,
    detail: t.closeConfirmBody,
    buttons: [t.discardAndClose, t.cancel],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
}

/** executeJavaScript 는 페이지 로드가 끝날 때까지 멈출 수 있다 — 교체 흐름을 막지 않게 상한을 둔다. */
const MARKER_TIMEOUT_MS = 1500;

/**
 * 렌더러에 저장하지 않은 프레임 편집이 있는가 — 렌더러가 <html data-unsaved-edits> 로 표시한다
 * (lib/frame-docs). 전용 IPC 를 더하지 않으려고 DOM 표식을 읽는다.
 * 읽지 못하면(렌더러 crash·시간 초과) "있다" 로 본다 — 확인 없이 편집을 버리는 것보다 한 번 더 묻는 쪽.
 */
export async function hasUnsavedEdits(win: BrowserWindow): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('편집 상태 조회 시간 초과')), MARKER_TIMEOUT_MS);
  });
  try {
    const marked: unknown = await Promise.race([
      win.webContents.executeJavaScript(
        "document.documentElement.hasAttribute('data-unsaved-edits')",
      ),
      timeout,
    ]);
    return marked === true;
  } catch (err) {
    log.warn('[asis] gifStudio — 편집 상태를 읽지 못해 확인을 받는다', err);
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 교체를 거절했을 때 새 녹화를 저장 폴더로 옮기고 결과를 알림으로 알린다.
 * 옮기기에 실패하면 tmp 는 지우지 않는다 — 사용자가 직접 찾을 수 있게 경로를 알린다.
 */
export async function preserveRecording(tmpPath: string): Promise<void> {
  const t = tGifStudio();
  let body: string;
  try {
    body = t.recordingKept(await keepRecording(tmpPath));
  } catch (err) {
    log.error('[asis] gif studio — 새 녹화 보존 실패', tmpPath, err);
    body = t.recordingKeepFailed(tmpPath);
  }
  new Notification({ title: t.windowTitle, body }).show();
}

/**
 * 창이 닫히면 false 로 끝난다 — 창이 사라질 때 그 창의 시트 promise 가 끝나지 않으면
 * open 체인 전체가 멈출 수 있어서 (AppKit 동작 미확인 — 방어적으로).
 */
export function untilClosed(win: BrowserWindow, answer: Promise<boolean>): Promise<boolean> {
  if (win.isDestroyed()) return Promise.resolve(false);
  return new Promise<boolean>((resolve, reject) => {
    const onClosed = (): void => resolve(false);
    win.once('closed', onClosed);
    // 먼저 답하면 closed 리스너를 뗀다 — 확인할 때마다 쌓이면 MaxListenersExceededWarning.
    answer.then((value) => {
      win.removeListener('closed', onClosed);
      resolve(value);
    }, (err: unknown) => {
      win.removeListener('closed', onClosed);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}
