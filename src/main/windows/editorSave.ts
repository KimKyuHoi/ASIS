import { app, dialog, nativeImage, Notification, type BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tMain } from '../i18n/strings';
import { saveUniqueInFolder } from '../saveFolder';
import devIconPath from '../../../resources/icon.png?asset';

/**
 * 에디터 결과 PNG 저장 — editorWindow 의 save / save-folder IPC 핸들러 본체.
 * dataUrl 은 renderer 가 stage 를 원본 픽셀로 export 한 PNG data URL.
 */

function resolveAppIcon(): Electron.NativeImage {
  const prodPath = join(process.resourcesPath, 'icon.png');
  const iconPath = existsSync(prodPath) ? prodPath : devIconPath;
  return nativeImage.createFromPath(iconPath);
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');
}

export async function saveWithDialog(
  win: BrowserWindow,
  dataUrl: string,
): Promise<{ saved: boolean; path?: string }> {
  const defaultPath = join(app.getPath('pictures'), `ASIS-${String(Date.now())}.png`);
  const result = await dialog.showSaveDialog(win, {
    defaultPath,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  });
  if (result.canceled || !result.filePath) {
    return { saved: false };
  }
  await writeFile(result.filePath, dataUrlToBuffer(dataUrl));
  return { saved: true, path: result.filePath };
}

/**
 * [폴더에 저장] — 저장 폴더에 ASIS_<시각>.png. 1초 안에 여러 번 저장해도 덮어쓰지 않는다
 * (saveFolder.saveUniqueInFolder 가 -2, -3 … 을 붙인다).
 */
export async function saveToFolder(dataUrl: string): Promise<{ path: string }> {
  const data = dataUrlToBuffer(dataUrl);
  const filePath = await saveUniqueInFolder('png', (candidate) =>
    writeFile(candidate, data, { flag: 'wx' }));
  new Notification({
    title: tMain().windows.editorSavedTitle,
    body: filePath,
    icon: resolveAppIcon(),
  }).show();
  return { path: filePath };
}
