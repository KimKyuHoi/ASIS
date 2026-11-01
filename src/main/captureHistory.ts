import { parseEditorProject, type EditorProjectData } from '../shared/editor-project';

/**
 * 캡처 히스토리 — 세션 내 메모리 저장.
 *
 * editorWindow 에서 copy/pin 시 addEntry 호출. 앱 재시작 시 초기화.
 * electron-store 로 영속화하면 대용량 dataURL 이 설정 파일을 수 MB 씩 차지하므로
 * 미사용. 추후 별도 sqlite/파일 캐시로 교체 가능.
 *
 * 메모리 상한 — 이미지 스튜디오는 최대 200MB 이미지(base64 ≈ 267MB)까지 받으므로 개수만으로는
 * 막을 수 없다. 그래서 세 단계로 자른다.
 *  1) 같은 편집 세션에서 핀·복사를 거듭하면 새 항목을 쌓지 않고 그 세션의 항목을 바꾼다.
 *  2) 다시 편집용 편집본(주석 없는 원본 + 도형)은 최신 MAX_PROJECT_ENTRIES 개, 합계
 *     MAX_PROJECT_BYTES 안에서만 남긴다 — 넘친 항목은 편집본만 떼어 낸다([편집]만 사라짐).
 *  3) 결과 이미지 + 편집본 전체 합계가 MAX_TOTAL_BYTES 를 넘으면 오래된 항목부터 지운다
 *     (가장 최신 항목은 크기와 관계없이 남긴다).
 * 바이트는 data URL 문자열 길이로 센다 — base64 는 V8 에서 1바이트 문자열이라 실제 메모리와 가깝다.
 */

const MAX_ENTRIES = 50;
const MAX_PROJECT_ENTRIES = 10;
const MAX_PROJECT_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;

type StoredEntry = {
  id: string;
  dataUrl: string;
  timestamp: number;
  width: number;
  height: number;
  /** 다시 편집용 — 위 상한 안에 드는 최신 항목에만 있다. */
  project: EditorProjectData | null;
  /** project 의 대략 크기 (배경 data URL + 도형 JSON). project 가 없으면 0. */
  projectBytes: number;
  /** 같은 편집 세션의 항목을 찾아 바꾸는 키 (editorWindow 가 세션마다 새로 만든다). */
  sessionKey: string;
};

/** renderer(히스토리 창)로 보내는 목록 항목 — 프로젝트 본문은 싣지 않고 편집 가능 여부만. */
export type HistoryEntry = Pick<StoredEntry, 'id' | 'dataUrl' | 'timestamp' | 'width' | 'height'> & {
  editable: boolean;
};

let entries: StoredEntry[] = [];

function projectSize(project: EditorProjectData | null): number {
  if (!project) return 0;
  return project.image.dataUrl.length + JSON.stringify(project.shapes).length;
}

/** 편집본 개수·합계 상한 — 넘치는 오래된 항목의 편집본을 떼어 낸다. */
function trimProjects(): void {
  let kept = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.project) continue;
    if (kept < MAX_PROJECT_ENTRIES && bytes + entry.projectBytes <= MAX_PROJECT_BYTES) {
      kept += 1;
      bytes += entry.projectBytes;
    } else {
      entry.project = null;
      entry.projectBytes = 0;
    }
  }
}

/** 개수·전체 합계 상한 — 오래된 항목부터 지운다(최신 항목은 남긴다). */
function trimEntries(): void {
  let total = 0;
  const keep: StoredEntry[] = [];
  for (const entry of entries) {
    const size = entry.dataUrl.length + entry.projectBytes;
    if (keep.length > 0 && (keep.length >= MAX_ENTRIES || total + size > MAX_TOTAL_BYTES)) break;
    keep.push(entry);
    total += size;
  }
  entries = keep;
}

export function addEntry(entry: {
  dataUrl: string;
  size: { width: number; height: number };
  project: EditorProjectData | null;
  sessionKey: string;
}): void {
  const id = `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  entries = entries.filter((e) => e.sessionKey !== entry.sessionKey);
  entries.unshift({
    id,
    dataUrl: entry.dataUrl,
    timestamp: Date.now(),
    ...entry.size,
    project: entry.project,
    projectBytes: projectSize(entry.project),
    sessionKey: entry.sessionKey,
  });
  trimProjects();
  trimEntries();
}

/** 최신순 목록 (프로젝트 본문 제외). */
export function getEntries(): HistoryEntry[] {
  return entries.map(({ id, dataUrl, timestamp, width, height, project }) => ({
    id, dataUrl, timestamp, width, height, editable: project !== null,
  }));
}

/** [편집] — 그 항목의 프로젝트. 없으면(오래돼 떼어 냈거나 사라진 id) throw. */
export function getEntryProject(id: string): EditorProjectData {
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`captureHistory: 없는 항목 ${id}`);
  if (!entry.project) throw new Error(`captureHistory: 편집본이 없는 항목 ${id}`);
  return entry.project;
}

/** 히스토리에 넣을 편집본 — IPC 로 받은 값이라 검증한다. 틀리면 로그를 남기고 편집본 없이(null). */
export function checkedProject(project: unknown): EditorProjectData | null {
  try {
    return parseEditorProject(project);
  } catch (err) {
    console.error('[asis] captureHistory: 편집본 검증 실패 — 편집본 없이 기록', err);
    return null;
  }
}
