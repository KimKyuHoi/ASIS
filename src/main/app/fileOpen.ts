import { app, dialog } from 'electron';
import log from 'electron-log/main';
import type { GifStudioWindowManager } from '../windows/gifStudioWindow';
import { IMAGE_STUDIO_EXTENSIONS, isImageStudioFile } from '../image-studio/imageFile';
import { userMessageOf } from '../userFacingError';
import { tMain } from '../i18n/strings';
import { gifStudioWindow } from './managers';
import { openImageStudio } from './captureFlows';
import { notifyError } from './notify';

/**
 * 파일 열기 경로 — GIF 스튜디오·이미지 스튜디오, Finder '열기'(Dock 아이콘 드롭 포함).
 */

type GifStudioOpenRequest = Parameters<GifStudioWindowManager['open']>[0];

function notifyGifStudioFailed(err: unknown, logLabel: string): void {
  log.error(`[asis] ${logLabel}`, err);
  notifyError(tMain().gifStudio.openFailed(userMessageOf(err)));
}

/** GIF 스튜디오 열기 — 실패(지원 안 하는 파일 등)는 알림으로 알린다. ready 이후에만 호출. */
export const openInGifStudio = (request: GifStudioOpenRequest): void => {
  gifStudioWindow.open(request).catch((err: unknown) => {
    notifyGifStudioFailed(err, 'gif studio open failed');
  });
};

/** 트레이·단축키 "GIF 스튜디오…" — 파일 선택 대화상자부터 연다. */
export const openGifStudioPicker = (): void => {
  gifStudioWindow.openWithPicker().catch((err: unknown) => {
    notifyGifStudioFailed(err, 'gif studio picker failed');
  });
};

/** 트레이 "이미지 스튜디오…" — 이미지 파일을 골라 에디터로 연다. */
export const openImageStudioPicker = (): void => {
  const t = tMain().imageStudio;
  dialog.showOpenDialog({
    title: t.openDialogTitle,
    properties: ['openFile'],
    filters: [{ name: t.fileTypeName, extensions: IMAGE_STUDIO_EXTENSIONS }],
  }).then(
    (result) => {
      const path = result.filePaths.at(0);
      if (result.canceled || path === undefined) return;
      openImageStudio(path);
    },
    (err: unknown) => {
      log.error('[asis] 이미지 스튜디오 대화상자 실패', err);
    },
  );
};

/**
 * Finder 에서 .gif/.mov/.png 등을 ASIS 로 열 때. 정지 이미지(png·jpg·heic …)는 이미지 스튜디오로,
 * 나머지(gif·영상)는 GIF 스튜디오로 보낸다.
 */
const openFileFromFinder = (path: string): void => {
  if (isImageStudioFile(path)) {
    openImageStudio(path);
    return;
  }
  const kind = path.toLowerCase().endsWith('.gif') ? 'gif' : 'video';
  openInGifStudio({ kind, path, deleteOnClose: false });
};

/** open-file 은 ready 전에도 오므로 큐에 쌓아 두고 flushPendingOpenFiles 가 처리한다. */
const pendingOpenFiles: string[] = [];

/** whenReady 이전에 호출 — 앱 실행을 일으킨 Finder '열기' 도 놓치지 않는다. */
export function registerOpenFileHandler(): void {
  app.on('open-file', (event, path) => {
    event.preventDefault();
    if (!app.isReady()) {
      pendingOpenFiles.push(path);
      return;
    }
    openFileFromFinder(path);
  });
}

/** ready 전에 들어온 Finder '열기' 요청을 처리한다. */
export function flushPendingOpenFiles(): void {
  pendingOpenFiles.splice(0).forEach(openFileFromFinder);
}
