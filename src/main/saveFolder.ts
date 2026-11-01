import { app } from 'electron';
import log from 'electron-log/main';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { settingsStore } from './settings';

/**
 * 저장 폴더에 겹치지 않는 이름으로 쓰기 — 에디터 [폴더에 저장]·GIF 스튜디오 내보내기 공용.
 *
 * 이름은 ASIS_<YYYYMMDD_HHMMSS>.<ext>. 초 단위라 1초 안에 두 번 저장하면 같은 이름이 된다 —
 * 그때 -2, -3 … 을 붙인다. "있는지 확인 후 쓰기" 는 그 사이 다른 저장이 끼어들 수 있으므로
 * *배타 생성*(writeFile flag 'wx' / copyFile COPYFILE_EXCL)에 맡기고 EEXIST 면 다음 번호로 간다.
 */

const MAX_ATTEMPTS = 1000;

/** 환경설정의 저장 폴더 — 비어 있으면('') ~/Pictures/ASIS. */
export function saveFolderPath(): string {
  return settingsStore.get('saveFolderPath') || join(app.getPath('pictures'), 'ASIS');
}

/** 파일 이름용 시각 — YYYYMMDD_HHMMSS (로컬 시간). */
export function timestampName(now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function isErrno(err: unknown, code: string): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === code;
}

/** 배타 생성으로 만든(=이 호출의) 반쯤 쓴 파일 정리. 이미 없으면 정상, 그 외 실패는 로그만. */
async function removePartial(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if (!isErrno(err, 'ENOENT')) log.warn('[asis] saveFolder partial cleanup failed', path, err);
  }
}

/**
 * 저장 폴더에 ASIS_<시각>[-n].<ext> 로 쓴다.
 *
 * @param writeExclusive candidate 경로에 *배타 생성* 으로 쓰는 함수 — 이미 있으면 EEXIST 로 실패해야
 *   한다 (writeFile(p, data, { flag: 'wx' }) 또는 copyFile(src, p, constants.COPYFILE_EXCL)).
 * @returns 저장된 경로
 *
 * 번호는 순서대로 하나씩 시도한다 — 동시에 시도하면 번호가 뒤섞인다.
 * EEXIST 가 아닌 실패(디스크 부족 등)는 그 후보가 이 호출이 만든 파일이므로 지운 뒤 다시 던진다.
 */
export async function saveUniqueInFolder(
  ext: string,
  writeExclusive: (candidate: string) => Promise<void>,
): Promise<string> {
  const folder = saveFolderPath();
  await mkdir(folder, { recursive: true });
  return tryCandidate({ base: join(folder, `ASIS_${timestampName()}`), ext, writeExclusive }, 1);
}

type Attempt = {
  base: string;
  ext: string;
  writeExclusive: (candidate: string) => Promise<void>;
};

/** n 번째 이름을 시도하고, 이미 있으면 n+1 로 — 하나씩 순서대로(재귀). */
async function tryCandidate(attempt: Attempt, n: number): Promise<string> {
  const { base, ext, writeExclusive } = attempt;
  if (n > MAX_ATTEMPTS) {
    throw new Error(`저장 폴더에 ${base}-*.${ext} 가 ${String(MAX_ATTEMPTS)}개 넘게 있다`);
  }
  const candidate = n === 1 ? `${base}.${ext}` : `${base}-${String(n)}.${ext}`;
  try {
    await writeExclusive(candidate);
    return candidate;
  } catch (err) {
    if (isErrno(err, 'EEXIST')) return tryCandidate(attempt, n + 1);
    await removePartial(candidate);
    throw err;
  }
}
