import https from 'node:https';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type GitHubRelease = {
  tag_name: string;
};

/** GitHub Releases latest API 에서 최신 tag를 가져온다. 실패 시 null. */
export function fetchLatestTag(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      'https://api.github.com/repos/KimKyuHoi/ASIS/releases/latest',
      { headers: { 'User-Agent': 'ASIS-updater' } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8');
            const release = JSON.parse(body) as GitHubRelease;
            resolve(release.tag_name ?? null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * GitHub Releases 에서 현재 아키텍처에 맞는 .pkg 를 임시 디렉토리에 다운로드한다.
 * quarantine 속성을 붙이지 않으므로 curl 과 동일하게 Gatekeeper 경고 없이 설치된다.
 */
export function downloadUpdatePkg(version: string): Promise<string> {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const bare = version.replace(/^v/, '');
  const filename = `ASIS-${bare}-${arch}.pkg`;
  const url = `https://github.com/KimKyuHoi/ASIS/releases/download/${version}/${filename}`;
  const dest = join(tmpdir(), `ASIS-update-${bare}-${arch}.pkg`);
  return downloadFile(url, dest).then(() => dest);
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    let done = false;

    const fail = (err: Error): void => {
      if (done) return;
      done = true;
      file.destroy();
      unlink(dest).catch(() => {});
      reject(err);
    };

    const request = (reqUrl: string, depth: number): void => {
      if (depth > 5) {
        fail(new Error('Too many redirects'));
        return;
      }
      https.get(reqUrl, { headers: { 'User-Agent': 'ASIS-updater' } }, (res) => {
        const code = res.statusCode ?? 0;
        if (code === 301 || code === 302 || code === 307 || code === 308) {
          res.resume();
          const loc = res.headers.location;
          if (!loc) {
            fail(new Error('Redirect without Location header'));
            return;
          }
          request(loc, depth + 1);
          return;
        }
        if (code !== 200) {
          res.resume();
          fail(new Error(`HTTP ${code}`));
          return;
        }
        res.pipe(file);
        res.on('error', fail);
        file.on('error', fail);
        file.once('finish', () => {
          if (done) return;
          done = true;
          file.close(() => resolve());
        });
      }).on('error', fail);
    };

    request(url, 0);
  });
}

/**
 * osascript 로 관리자 권한을 요청한 뒤 installer -pkg 를 실행한다.
 * macOS Installer GUI 없이 설치되고, 사용자는 비밀번호 한 번만 입력한다.
 * 비밀번호 대화상자를 취소하면 Error('canceled') 로 reject 된다.
 */
export function installPkg(pkgPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const escaped = pkgPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `do shell script "installer -pkg \\"${escaped}\\" -target /" with administrator privileges`;
    const child = spawn('osascript', ['-e', script]);
    const stderrChunks: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString().trim();
      // AppleScript error -128 = 사용자가 비밀번호 대화상자를 취소
      if (stderr.includes('-128') || stderr.toLowerCase().includes('user canceled')) {
        reject(new Error('canceled'));
        return;
      }
      reject(new Error(`installer 실패 (exit ${code}): ${stderr}`));
    });
  });
}

/** semver 비교 — latest 가 current 보다 크면 true. */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
