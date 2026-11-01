import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, nativeTheme, shell } from 'electron';
import {
  findInvalidMiscEnum,
  loadEditorHotkeys,
  loadHotkeys,
  loadMisc,
  settingsStore,
  type HotkeyConfig,
  type MiscConfig,
} from '../settings';
import type { EditorHotkeyConfig } from '../../shared/editor-hotkeys';
import { getEntries, getEntryProject } from '../captureHistory';
import { assertPatchNoteUrl, fetchPatchNotes } from '../patch-notes/patchNotes';
import { tMain } from '../i18n/strings';
import {
  beginHotkeyRecording,
  editorWindow,
  endHotkeyRecording,
  pinWindow,
  runningFeatures,
  settingsWindow,
  shortcutManager,
  trayManager,
} from './managers';
import { openInEditor } from './captureFlows';

/**
 * 앱 전체 lifecycle 동안 유효한 IPC 핸들러 — 환경설정·히스토리·변경 이력·클립보드.
 * whenReady 이전에 한 번 등록한다(채널 등록은 ready 를 기다릴 필요가 없다).
 */
export function registerIpcHandlers(): void {
  registerSettingsIpc();
  registerHistoryIpc();

  // 변경 이력 IPC — 번들 노트(release-notes/) + GitHub Releases.
  ipcMain.handle('patch-history:list', () => fetchPatchNotes());
  // 본문 마크다운 링크(외부 입력 포함)도 이 채널로 온다 — https 만 연다.
  ipcMain.handle('patch-history:open-url', (_event, url: string) =>
    shell.openExternal(assertPatchNoteUrl(url)),
  );

  // 텍스트 클립보드 복사 — color picker 의 HEX 등.
  // renderer 의 navigator.clipboard.writeText 는 창 포커스·우클릭(user activation 미부여)
  // 상황에서 거부될 수 있어, main 의 clipboard.writeText 로 우회한다(포커스 무관).
  ipcMain.handle('clipboard:write-text', (_event, text: string) => {
    clipboard.writeText(text);
  });
}

function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => loadHotkeys());
  // ESC — 환경설정 창 닫기.
  ipcMain.on('settings:close', () => {
    settingsWindow.stop();
  });
  /**
   * 지금 실행 중인 기능 목록 — 환경설정 창의 경고 배너용.
   * 녹화·캡처가 도는 중에 단축키를 만지면 그 동안 전역 단축키가 멈추고,
   * GIF/영상 녹화처럼 ESC 를 전역 등록해 둔 기능은 ESC 로 취소돼 버린다.
   */
  ipcMain.handle('settings:get-running-features', () => runningFeatures());
  ipcMain.on('settings:hotkey-recording', (event, active: boolean) => {
    if (active) beginHotkeyRecording(event.sender);
    else endHotkeyRecording(true);
  });
  ipcMain.handle('settings:set', (_event, hotkeys: HotkeyConfig) => {
    settingsStore.set('hotkeys', hotkeys);
    shortcutManager.reload();
    // 트레이 메뉴의 accelerator 표기가 저장값을 읽으므로 재빌드.
    trayManager.refresh();
  });

  // 에디터 도구 단축키 — 열려 있는 에디터 창에도 즉시 반영한다 (창을 다시 열 필요 없음).
  ipcMain.handle('settings:get-editor-hotkeys', () => loadEditorHotkeys());
  ipcMain.handle('settings:set-editor-hotkeys', (_event, hotkeys: EditorHotkeyConfig) => {
    settingsStore.set('editorHotkeys', hotkeys);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('settings:editor-hotkeys-changed', hotkeys);
    }
  });

  ipcMain.handle('settings:get-folder', () => settingsStore.get('saveFolderPath'));
  ipcMain.handle('settings:pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: tMain().capture.saveFolderDialogTitle,
      defaultPath: settingsStore.get('saveFolderPath') || app.getPath('pictures'),
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const picked = result.filePaths[0];
    settingsStore.set('saveFolderPath', picked);
    return picked;
  });

  ipcMain.handle('settings:get-misc', () => loadMisc());
  ipcMain.handle('settings:set-misc', (_event, misc: MiscConfig) => {
    // 저장 전에 검증 — 잘못된 값이 저장되면 다음 실행의 themeSource 대입까지 오염된다.
    const invalidKey = findInvalidMiscEnum(misc);
    if (invalidKey) {
      throw new Error(`settings:set-misc — 허용되지 않는 ${invalidKey} 값: ${misc[invalidKey]}`);
    }
    settingsStore.set('misc', misc);
    // 라이트/다크 — themeSource 가 prefers-color-scheme 을 결정한다(열린 창에도 즉시 반영).
    nativeTheme.themeSource = misc.appearance;
    // dev 에서는 Electron 바이너리가 로그인 항목으로 등록돼 버리므로 패키징 앱에서만.
    if (process.platform === 'darwin' && app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: misc.openAtLogin });
    }
  });
}

function registerHistoryIpc(): void {
  ipcMain.handle('history:list', () => getEntries());
  // [편집] — 편집본이 없는 id 면 throw (renderer 는 editable 인 항목에만 버튼을 띄운다).
  ipcMain.handle('history:edit', (_event, id: string) => {
    const project = getEntryProject(id);
    openInEditor(() => editorWindow.showProject(project), () => tMain().editorProject);
  });
  ipcMain.handle('history:copy', (_event, dataUrl: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
  });
  // 4개 인자 — max-params(3) 때문에 rest 튜플로 받는다.
  ipcMain.handle('history:pin', (...[, dataUrl, w, h]: [unknown, string, number, number]) => {
    pinWindow.pin(dataUrl, w, h);
  });
}
