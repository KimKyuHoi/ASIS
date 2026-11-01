import { unlink } from 'node:fs/promises';

function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * 녹화 임시 파일 삭제. 이미 없으면(ENOENT) 정상이고, 그 밖의 실패는 경고만 남긴다 —
 * 임시 파일 정리 실패가 녹화 결과를 바꾸지는 않는다.
 */
export async function removeTempFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err: unknown) {
    if (!isEnoent(err)) console.warn('[asis] video tmp cleanup failed', err);
  }
}
