import { app, clipboard } from 'electron';
import log from 'electron-log/main';
import { copyFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 애니메이션 GIF 를 클립보드에 "파일" 로 올린다 (Finder 에서 ⌘C 한 것과 같은 형태).
 *
 * 실측 (Electron 39.8.9, macOS):
 *   - writeImage / writeBuffer('com.compuserve.gif') → pasteboard 에 GIF picture 는
 *     들어가지만, Chromium 계열(Chrome·Slack·Notion) paste 이벤트는 image.png
 *     (첫 프레임) 만 받는다 — 애니메이션 손실.
 *   - writeBuffer('public.file-url') → «class furl» 로 들어가고, paste 이벤트에서
 *     test.gif (image/gif, GIF89a) 파일로 받는다 — 애니메이션 유지.
 *
 * 파일 URL 은 붙여넣는 시점에 파일을 읽으므로 원본을 바로 지우면 안 된다.
 * 전용 폴더에 최근 KEEP_COUNT 개만 남기고 나머지는 쓸 때마다 정리한다.
 */

const DIR_NAME = 'asis-gif-clipboard';
const KEEP_COUNT = 5;
const FILE_URL_FORMAT = 'public.file-url';

function gifClipboardDir(): string {
  return join(app.getPath('temp'), DIR_NAME);
}

/** 클립보드용 GIF 출력 경로 — 붙여넣기 시 업로드 파일명이 되므로 ASIS-<ts>.gif. */
export async function nextGifClipboardPath(): Promise<string> {
  const dir = gifClipboardDir();
  await mkdir(dir, { recursive: true });
  return join(dir, `ASIS-${Date.now()}.gif`);
}

/**
 * gifPath 를 클립보드에 파일로 올린다.
 * 전용 폴더 밖의 파일(예: gif-studio 의 작업 tmp) 이면 전용 폴더로 스냅샷 복사한 뒤 올린다 —
 * 호출부가 원본을 지우거나 덮어써도 붙여넣기 내용이 바뀌지 않게 한다.
 */
export async function copyGifToClipboard(gifPath: string): Promise<void> {
  let clipPath = gifPath;
  if (dirname(gifPath) !== gifClipboardDir()) {
    clipPath = await nextGifClipboardPath();
    await copyFile(gifPath, clipPath);
  }
  const url = pathToFileURL(clipPath).href;
  clipboard.writeBuffer(FILE_URL_FORMAT, Buffer.from(url, 'utf8'));
  // writeBuffer 는 실패해도 throw 하지 않는다 — 다시 읽어 실제로 올라갔는지 확인한다.
  const written = clipboard.readBuffer(FILE_URL_FORMAT).toString('utf8');
  if (written !== url) {
    throw new Error(`gif clipboard write mismatch: expected ${url}, got "${written}"`);
  }
  // 정리 실패가 복사 실패로 번지면 호출부가 방금 올린 파일을 지워 버린다 — 로그만 남긴다.
  await pruneOldGifs(clipPath).catch((err: unknown) => {
    log.warn('[asis] gif clipboard prune failed', err);
  });
}

async function pruneOldGifs(keepPath: string): Promise<void> {
  const dir = gifClipboardDir();
  const names = (await readdir(dir)).filter((name) => name.endsWith('.gif'));
  const stats = await Promise.all(names.map(async (name) => {
    const path = join(dir, name);
    try {
      return { path, mtimeMs: (await stat(path)).mtimeMs };
    } catch (err) {
      // readdir 이후 다른 정리 경로가 먼저 지운 경우 — 이미 정리된 것이므로 건너뛴다.
      if (!isEnoent(err)) throw err;
      return null;
    }
  }));
  const entries = stats.filter((entry) => entry !== null);
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  // 방금 클립보드에 올린 파일은 mtime 이 꼬여도 지우지 않는다.
  const stale = entries.slice(KEEP_COUNT).filter((entry) => entry.path !== keepPath);
  await Promise.all(stale.map((entry) => unlink(entry.path).catch((err: unknown) => {
    if (!isEnoent(err)) log.warn('[asis] gif clipboard prune failed', entry.path, err);
  })));
}

function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
