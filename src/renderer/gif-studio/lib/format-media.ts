export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 00:03.62 — 레퍼런스 UI 의 길이 표기. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
}

export function errorMessage(err: unknown): string {
  // ipcRenderer.invoke 의 reject 는 "Error invoking remote method '…': Error: <msg>" 형태.
  const raw = err instanceof Error ? err.message : String(err);
  const match = /Error invoking remote method '[^']+': (?:Error: )?(.*)$/s.exec(raw);
  return match ? match[1] : raw;
}
