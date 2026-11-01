import { dialog, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { constants } from 'node:fs';
import { copyFile, mkdtemp, realpath, rm, stat, unlink } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import { saveFolderPath, saveUniqueInFolder, timestampName } from '../saveFolder';
import { copyGifToClipboard } from '../capture/gifClipboard';
import { FfmpegCanceledError, type FfmpegJob } from './ffmpeg';
import { exportGif } from './gifExport';
import { writeOverlayTrack } from './overlayTrack';
import { UserFacingError } from '../userFacingError';
import { tGifStudio } from './strings';
import type { GifExportRequest, GifExportResult, GifStudioMedia } from './types';

/** 창 매니저가 넘기는 현재 세션 — 내보내기 한 번에 필요한 전부. */
export type ExportSession = {
  win: BrowserWindow;
  media: GifStudioMedia;
  /** 미디어별 tmp 작업 폴더 (overlay.png·인코딩 중간 출력). */
  workDir: string;
  /** spawn 전 단계(다이얼로그 등)에서 들어온 취소·창 닫힘을 확인한다. */
  isCanceled: () => boolean;
};

/**
 * 출력 대상(폴더·다른 이름·클립보드)별로 내보낸다.
 *
 * ffmpeg 는 항상 workDir 의 tmp 파일에 쓰고, 성공한 뒤에만 최종 위치로 복사한다 —
 * 실패·취소 정리가 사용자가 고른 기존 파일(덮어쓰기 대상)을 지우는 일이 없게.
 */
export async function runExport(
  job: FfmpegJob,
  session: ExportSession,
  request: GifExportRequest,
): Promise<GifExportResult> {
  if (request.mediaPath !== session.media.path) {
    // 주석을 굽는 동안 다른 파일로 바뀌었다 — 예전 트림·주석을 새 파일에 입히지 않는다.
    throw new UserFacingError(
      tGifStudio().mediaChanged,
      `export for ${request.mediaPath}, open ${session.media.path}`,
    );
  }
  const destination = await resolveDestination(session, request);
  if (destination === null || session.isCanceled()) return { kind: 'canceled' };
  // 이번 내보내기 전용 폴더 — 오버레이 PNG(수백 장일 수 있다)·인코딩 출력을 끝나면 폴더째 지운다.
  const runDir = await mkdtemp(join(session.workDir, 'export-'));
  try {
    return await encodeTo(job, { session, request, destination, runDir });
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

async function encodeTo(
  job: FfmpegJob,
  run: {
    session: ExportSession;
    request: GifExportRequest;
    destination: Destination;
    runDir: string;
  },
): Promise<GifExportResult> {
  const { session, request, destination, runDir } = run;
  const overlayPath = request.overlay === null
    ? null
    : await writeOverlayTrack(request.overlay, request.options, runDir);
  if (session.isCanceled()) return { kind: 'canceled' };

  const encoded = join(runDir, 'export.gif');
  try {
    const { media } = session;
    await exportGif(job, { media, options: request.options, overlayPath, outputPath: encoded });
    const { size } = await stat(encoded);
    if (destination.kind === 'clipboard') {
      // gifClipboard 가 자기 폴더로 스냅샷 복사하므로 tmp 출력은 바로 지워도 된다.
      await copyGifToClipboard(encoded);
      return { kind: 'copied', size };
    }
    if (destination.kind === 'folder') {
      return { kind: 'saved', path: await copyToSaveFolder(encoded), size };
    }
    await copyFile(encoded, destination.path);
    return { kind: 'saved', path: destination.path, size };
  } catch (err) {
    // 사용자 취소(또는 창 닫힘)는 실패가 아니다.
    if (err instanceof FfmpegCanceledError) return { kind: 'canceled' };
    throw err;
  }
}

/** 최종 위치 — 클립보드는 파일로 남기지 않는다. */
type Destination =
  | { kind: 'clipboard' } |
  // 저장 폴더 — 이름은 복사 시점에 정한다 (인코딩 중 같은 이름이 생겨도 덮지 않게).
  { kind: 'folder' } |
  { kind: 'file'; path: string };

/** save-as 다이얼로그 취소면 null. */
async function resolveDestination(
  { win, media }: ExportSession,
  request: GifExportRequest,
): Promise<Destination | null> {
  if (request.target === 'clipboard') return { kind: 'clipboard' };

  if (request.target === 'folder') return { kind: 'folder' };

  const t = tGifStudio();
  // 원본이 녹화 tmp 면 그 이름이 의미 없으니 타임스탬프 이름을 쓴다.
  const baseName = media.deleteOnClose ? `ASIS_${timestampName()}` : parse(media.path).name;
  const result = await dialog.showSaveDialog(win, {
    title: t.saveDialogTitle,
    defaultPath: join(saveFolderPath(), `${baseName}.gif`),
    filters: [{ name: t.gifFilterName, extensions: ['gif'] }],
  });
  if (result.canceled || !result.filePath) return null;
  if (await samePath(result.filePath, media.path)) {
    // tmp 에 먼저 쓰므로 원본이 망가지진 않지만, 열린 미디어를 덮으면 세션이 어긋난다.
    throw new UserFacingError(tGifStudio().cannotOverwriteSource, result.filePath);
  }
  return { kind: 'file', path: result.filePath };
}

/**
 * src 를 저장 폴더에 ASIS_<시각>.gif 로 복사한다. 같은 이름이 있으면 -2, -3 … 을 붙인다
 * (에디터 [폴더에 저장] 과 같은 규칙 — saveFolder.saveUniqueInFolder).
 * @returns 저장된 경로
 */
export function copyToSaveFolder(src: string): Promise<string> {
  return saveUniqueInFolder('gif', (candidate) =>
    copyFile(src, candidate, constants.COPYFILE_EXCL));
}

/** symlink·대소문자(APFS 기본 대소문자 무시) 차이까지 같은 파일인지 비교. */
async function samePath(a: string, b: string): Promise<boolean> {
  const [ra, rb] = await Promise.all([canonical(a), canonical(b)]);
  return ra.toLowerCase() === rb.toLowerCase();
}

/** 아직 없는 파일(새 이름)은 부모 폴더만 realpath 로 푼다. */
async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (err) {
    if (!isEnoent(err)) throw err;
    return join(await realpath(dirname(resolve(path))), parse(path).base);
  }
}

/** 이미 없으면 정상 (중복 정리). 그 외 실패는 로그만 — 정리 실패가 사용자 작업을 막지 않게. */
export async function removeFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if (isEnoent(err)) return;
    log.warn('[asis] gifStudio file cleanup failed', path, err);
  }
}

export function isEnoent(err: unknown): boolean {
  return isErrno(err, 'ENOENT');
}

function isErrno(err: unknown, code: string): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === code;
}
