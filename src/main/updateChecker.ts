import https from 'node:https';

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
