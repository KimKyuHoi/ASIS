/**
 * 캡처 히스토리 — 세션 내 메모리 저장.
 *
 * editorWindow 에서 copy/pin 시 addEntry 호출. 앱 재시작 시 초기화.
 * electron-store 로 영속화하면 대용량 dataURL 이 설정 파일을 수 MB 씩 차지하므로
 * 미사용. 추후 별도 sqlite/파일 캐시로 교체 가능.
 */

const MAX_ENTRIES = 50;

export type HistoryEntry = {
  id: string;
  dataUrl: string;
  timestamp: number;
  width: number;
  height: number;
};

const entries: HistoryEntry[] = [];

export function addEntry(
  dataUrl: string,
  width: number,
  height: number,
): void {
  const id = `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  entries.unshift({ id, dataUrl, timestamp: Date.now(), width, height });
  if (entries.length > MAX_ENTRIES) entries.pop();
}

export function getEntries(): HistoryEntry[] {
  return entries;
}
