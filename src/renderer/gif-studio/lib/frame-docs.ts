import { useEditorStore } from '../../editor/lib/store';
import type { Shape } from '../../editor/types/shapes';
import { commitPendingText, newShapeId } from './annotation-tools';
import { frameAt, frameCenter, frameSpan, type FrameGrid } from './frame-grid';

/**
 * 프레임별 주석 문서 — 모듈 스코프 외부 store.
 *
 * 이미지 에디터의 zustand store 는 "지금 편집 중인 한 장" 만 안다. 프레임을 바꿀 때
 * 지금 프레임의 도형·undo 기록을 여기 보관하고, 다음 프레임 것을 에디터 store 에 넣는다.
 * 그래서 에디터의 도구·단축키·undo 가 프레임마다 독립으로 동작한다.
 *
 * 문서 키는 프레임 번호가 아니라 "그 프레임 가운데의 원본 시각(ms)" 이다. 트림을 줄였다
 * 늘리거나 FPS·속도를 바꿔 격자가 달라져도 주석은 지워지지 않고, 격자는 어느 프레임에
 * 보일지만 정한다. 한 프레임 구간에 문서가 여럿 들어오면(FPS 를 낮춘 경우) 열 때 합친다.
 *
 * side-effects.md — React 는 useSyncExternalStore(hook/useFrames.ts)로 스냅샷만 읽는다.
 */

type FrameDoc = {
  shapes: Shape[];
  past: Shape[][];
  future: Shape[][];
  nextStepNum: number;
};

export type FrameSelection = { from: number; to: number };

export type FramesSnapshot = {
  grid: FrameGrid;
  current: number;
  /** shift+클릭으로 고른 프레임 구간 (from ≤ to). 없으면 null. */
  selection: FrameSelection | null;
  /** 주석이 하나라도 있는 프레임 (지금 격자 기준). */
  annotated: ReadonlySet<number>;
};

const EMPTY_DOC: FrameDoc = { shapes: [], past: [], future: [], nextStepNum: 1 };

/**
 * 트림 경계를 옮길 때 — 다음 격자 변경에서 이 원본 시각의 프레임을 편집하게 한다.
 * (트림 state 가 바뀐 뒤 effect 가 격자를 바꾸므로, 지금 격자로는 새 경계 프레임을 못 가리킨다.)
 * 쓰지 않은 채 남지 않게 gotoFrame·resetFrames·격자가 그대로인 setGrid 에서 비운다.
 */
let focusTime: number | null = null;

let docs = new Map<number, FrameDoc>();
/**
 * 지금 프레임을 에디터에 넣을 때의 도형·기록 참조. 편집하지 않았으면(같은 참조) commitEditor 가
 * 아무것도 다시 쓰지 않는다 — 트림 드래그처럼 격자가 연달아 바뀔 때 문서 키가 새 격자 중심으로
 * 계속 옮겨 다니다 이웃 프레임 문서와 합쳐지는 것을 막는다.
 */
let loaded: Pick<FrameDoc, 'shapes' | 'past' | 'future'> | null = null;
/** 편집 횟수 — 마지막으로 내보낸 시점(savedVersion)과 다르면 저장하지 않은 편집이 있다. */
let version = 0;
let savedVersion = 0;
/** 프레임 전환으로 에디터 store 를 바꿔 끼우는 중 — 편집으로 세지 않는다. */
let swapping = false;
let snapshot: FramesSnapshot = {
  grid: { start: 0, end: 1, step: 1, count: 1 },
  current: 0,
  selection: null,
  annotated: new Set(),
};
const listeners = new Set<() => void>();

export function subscribeFrames(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFrames(): FramesSnapshot {
  return snapshot;
}

/** docs.keys() 에서 나온 키 — 없으면 버그 (null 로 무마하지 않는다). */
function requireDoc(key: number): FrameDoc {
  const doc = docs.get(key);
  if (!doc) throw new Error(`frame-docs — 사라진 문서 키 ${key}`);
  return doc;
}

function timeKey(t: number): number {
  return Math.round(t * 1000);
}

/** 지금 격자에서 프레임별로 문서 키를 묶는다 (트림 밖 문서는 빠진다 — 지우지는 않는다). */
function keysByFrame(grid: FrameGrid): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const key of docs.keys()) {
    const t = key / 1000;
    if (t < grid.start || t >= grid.end) continue;
    const k = frameAt(grid, t);
    out.set(k, [...(out.get(k) ?? []), key]);
  }
  return out;
}

function publish(patch: Partial<FramesSnapshot>): void {
  const next = { ...snapshot, ...patch };
  const annotated = new Set<number>();
  for (const [k, keys] of keysByFrame(next.grid)) {
    if (keys.some((key) => requireDoc(key).shapes.length > 0)) annotated.add(k);
  }
  snapshot = { ...next, annotated };
  for (const listener of listeners) listener();
}

/** 프레임 k 의 문서 — 구간 안 문서가 여럿이면 하나로 합쳐 다시 저장한다. */
function takeDoc(grid: FrameGrid, k: number): FrameDoc {
  const { start, end } = frameSpan(grid, k);
  const keys = [...docs.keys()].filter((key) => key / 1000 >= start && key / 1000 < end);
  const first = keys.at(0);
  if (first === undefined) return EMPTY_DOC;
  const firstDoc = docs.get(first);
  if (!firstDoc) throw new Error(`frame-docs — 사라진 문서 키 ${first}`);
  if (keys.length === 1) return firstDoc;
  const shapes = keys.flatMap((key) => requireDoc(key).shapes);
  for (const key of keys) docs.delete(key);
  const merged: FrameDoc = { shapes, past: [], future: [], nextStepNum: 1 };
  docs.set(timeKey(frameCenter(grid, k)), merged);
  return merged;
}

function putDoc(grid: FrameGrid, k: number, doc: FrameDoc): void {
  const { start, end } = frameSpan(grid, k);
  for (const key of [...docs.keys()]) {
    if (key / 1000 >= start && key / 1000 < end) docs.delete(key);
  }
  const empty = doc.shapes.length === 0 && doc.past.length === 0 && doc.future.length === 0;
  if (!empty) docs.set(timeKey(frameCenter(grid, k)), doc);
}

/** 지금 에디터 store 의 도형·기록을 현재 프레임 문서로 보관한다. */
export function commitEditor(): void {
  commitPendingText();
  const st = useEditorStore.getState();
  const untouched = loaded !== null &&
    loaded.shapes === st.shapes && loaded.past === st.past && loaded.future === st.future;
  if (untouched) return;
  loaded = { shapes: st.shapes, past: st.past, future: st.future };
  putDoc(snapshot.grid, snapshot.current, {
    shapes: st.shapes,
    past: st.past,
    future: st.future,
    nextStepNum: st.nextStepNum,
  });
  publish({});
}

/** 프레임 k 의 문서를 에디터 store 에 넣는다 (배경 이미지는 hook/useFrameBackground 가 바꾼다). */
function loadIntoEditor(grid: FrameGrid, k: number): void {
  const doc = takeDoc(grid, k);
  loaded = { shapes: doc.shapes, past: doc.past, future: doc.future };
  swapping = true;
  useEditorStore.setState({
    shapes: doc.shapes,
    past: doc.past,
    future: doc.future,
    nextStepNum: doc.nextStepNum,
    selectedIds: [],
    drawing: null,
    editingId: null,
    marquee: null,
  });
  swapping = false;
}

/** 새 미디어 — 문서를 비우고 격자를 맞춘다. */
export function resetFrames(grid: FrameGrid): void {
  focusTime = null;
  docs = new Map();
  version = 0;
  savedVersion = 0;
  document.documentElement.removeAttribute('data-unsaved-edits');
  loadIntoEditor(grid, 0);
  publish({ grid, current: 0, selection: null });
}

export function gotoFrame(k: number): void {
  // 직접 프레임을 골랐다 — 남아 있던 트림 핸들 시각은 더 이상 유효하지 않다.
  focusTime = null;
  const { grid, current } = snapshot;
  const target = Math.min(grid.count - 1, Math.max(0, k));
  if (target === current) return;
  commitEditor();
  loadIntoEditor(grid, target);
  publish({ current: target });
}

export function setSelection(selection: FrameSelection | null): void {
  publish({ selection });
}

export function setFocusTime(t: number): void {
  focusTime = t;
}

/** 트림·FPS·속도가 바뀌었다 — 같은 원본 시각(또는 setFocusTime)의 프레임을 계속 편집한다. */
export function setGrid(next: FrameGrid): void {
  const prev = snapshot.grid;
  if (prev.start === next.start && prev.end === next.end && prev.step === next.step) {
    focusTime = null;
    return;
  }
  commitEditor();
  const keep = focusTime ?? frameCenter(prev, snapshot.current);
  focusTime = null;
  const current = frameAt(next, keep);
  loadIntoEditor(next, current);
  publish({ grid: next, current, selection: null });
}

/** 현재 프레임 도형을 targets 프레임들에 복제해 덧붙인다 (새 id). @returns 복사한 프레임 수 */
export function copyCurrentTo(targets: readonly number[]): number {
  commitEditor();
  const { grid, current } = snapshot;
  const source = takeDoc(grid, current);
  if (source.shapes.length === 0) return 0;
  let copied = 0;
  for (const k of targets) {
    if (k === current || k < 0 || k >= grid.count) continue;
    const doc = takeDoc(grid, k);
    const clones = source.shapes.map((s) => ({ ...s, id: newShapeId() }));
    putDoc(grid, k, {
      ...doc,
      shapes: [...doc.shapes, ...clones],
      past: [...doc.past, doc.shapes],
      future: [],
    });
    copied += 1;
  }
  if (copied > 0) version += 1;
  publish({});
  refreshUnsavedMarker();
  return copied;
}

/** 현재 프레임의 주석을 모두 지운다 (undo 로 되돌릴 수 있게 에디터 기록에 남긴다). */
export function clearCurrent(): void {
  const st = useEditorStore.getState();
  if (st.shapes.length === 0) return;
  useEditorStore.setState({
    shapes: [],
    past: [...st.past, st.shapes],
    future: [],
    selectedIds: [],
  });
  commitEditor();
}

/** 내보내기용 — 편집 중인 것까지 확정한, 지금 격자의 프레임별 도형 (주석 있는 프레임만). */
export function exportFrameShapes(): ReadonlyMap<number, Shape[]> {
  commitEditor();
  const out = new Map<number, Shape[]>();
  for (const [k, keys] of keysByFrame(snapshot.grid)) {
    const shapes = keys.flatMap((key) => requireDoc(key).shapes);
    if (shapes.length > 0) out.set(k, shapes);
  }
  return out;
}

/** 재생 중 미리보기용 — 프레임 k 의 도형 (지금 편집 중인 프레임이면 에디터 store 기준). */
export function shapesOf(k: number): Shape[] {
  const { grid, current } = snapshot;
  if (k === current) return useEditorStore.getState().shapes;
  const { start, end } = frameSpan(grid, k);
  // 주석을 한 번도 넣지 않은 프레임은 문서가 없다 (정상) — 빈 목록.
  return [...docs.entries()]
    .filter(([key]) => key / 1000 >= start && key / 1000 < end)
    .flatMap(([, doc]) => doc.shapes);
}

let syncInstalled = false;

/**
 * 현재 프레임에 처음 그리거나 다 지웠을 때 프레임 바의 "주석 있음" 표시를 바로 맞춘다.
 * 창 수명 = 구독 수명이라 cleanup 은 버린다 (session-store 와 같은 모듈 스코프 init).
 */
export function installFramesSync(): void {
  if (syncInstalled) return;
  syncInstalled = true;
  // 저장하지 않은 편집이 있으면 창 닫기를 막는다 — main 의 will-prevent-unload 가 확인 시트를 띄운다.
  window.addEventListener('beforeunload', (e) => {
    if (!hasUnsavedEdits()) return;
    e.preventDefault();
  });
  useEditorStore.subscribe((state, prev) => {
    if (!swapping && state.shapes !== prev.shapes) {
      version += 1;
      refreshUnsavedMarker();
    }
    const has = state.shapes.length > 0;
    if (has === snapshot.annotated.has(snapshot.current)) return;
    const annotated = new Set(snapshot.annotated);
    if (has) annotated.add(snapshot.current);
    else annotated.delete(snapshot.current);
    snapshot = { ...snapshot, annotated };
    for (const listener of listeners) listener();
  });
}

/** 내보내기(저장·복사)에 성공했다 — 지금까지의 편집은 저장된 것으로 본다. */
export function markSaved(): void {
  savedVersion = version;
  refreshUnsavedMarker();
}

/** 닫기 전에 물어야 하는가 — 마지막 내보내기 뒤에 편집했고, 주석이 하나라도 남아 있다. */
function hasUnsavedEdits(): boolean {
  if (version === savedVersion) return false;
  if (useEditorStore.getState().shapes.length > 0) return true;
  // 지금 프레임은 에디터 store 가 최신이다 — 커밋 전 예전 문서(다 지우기 전 내용)는 보지 않는다.
  const { start, end } = frameSpan(snapshot.grid, snapshot.current);
  return [...docs.entries()].some(([key, doc]) => {
    const t = key / 1000;
    return (t < start || t >= end) && doc.shapes.length > 0;
  });
}

/**
 * 저장하지 않은 편집 표식 — <html data-unsaved-edits>. main 이 미디어를 바꾸기 전에 읽고
 * (windows/gifStudioWindow), beforeunload 가 창 닫기를 막을지 정한다.
 */
function refreshUnsavedMarker(): void {
  document.documentElement.toggleAttribute('data-unsaved-edits', hasUnsavedEdits());
}
