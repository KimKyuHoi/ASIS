import { PALETTE, useEditorStore } from '../../editor/lib/store';
import type { EllipseShape, Shape } from '../../editor/types/shapes';
import type { GuideDraftStep } from '../../../shared/step-guide';

/**
 * 단계별 주석 문서 — 모듈 스코프 외부 store.
 *
 * 이미지 에디터의 zustand store 는 "지금 편집 중인 한 장" 만 안다(GIF 스튜디오 frame-docs 와
 * 같은 방식). 단계를 바꿀 때 지금 단계의 도형·undo 기록을 여기 보관하고, 다음 단계 것을
 * 에디터 store 에 넣는다 — 도구·단축키·undo 가 단계마다 독립으로 동작한다.
 *
 * side-effects.md — React 는 useSyncExternalStore(hook/useStepAnnotations)로 version 만 읽는다.
 */

type StepDoc = {
  shapes: Shape[];
  past: Shape[][];
  future: Shape[][];
  nextStepNum: number;
};

/** 에디터에 띄울 단계 — 배경 이미지와 그 픽셀 크기. */
export type AnnotatableStep = { id: string; imageDataUrl: string; width: number; height: number };

const docs = new Map<string, StepDoc>();
let currentId: string | null = null;
/** 지금 단계를 에디터에 넣을 때의 참조 — 편집이 없으면(같은 참조) 다시 쓰지 않는다. */
let loaded: Pick<StepDoc, 'shapes' | 'past' | 'future'> | null = null;
/** 도형이 바뀔 때마다 +1 — 편집 창의 "미저장" 판단에 섞는다. */
let version = 0;
/** 단계 전환으로 에디터 store 를 바꿔 끼우는 중 — 편집으로 세지 않는다. */
let swapping = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

// 에디터 store 의 도형 변화 = 사용자의 주석 편집(단계 전환 중 교체는 제외).
useEditorStore.subscribe((next, prev) => {
  if (swapping || currentId === null) return;
  if (next.shapes === prev.shapes) return;
  version += 1;
  notify();
});

/**
 * 클릭 위치 기본 표시 — 빨간 동그라미 하나를 그 단계의 첫 주석으로 넣는다.
 * 일반 에디터 도형이라 옮기기·크기·색·두께 변경·삭제가 모두 된다(지우면 표시 없이 저장).
 * 크기는 이미지 짧은 변 비례 — Retina 전체 화면(짧은 변 ~2200px)에서 반지름 ~55px.
 */
function clickCircle(step: GuideDraftStep): EllipseShape {
  const short = Math.min(step.width, step.height);
  const radius = Math.max(24, Math.round(short * 0.025));
  return {
    kind: 'ellipse',
    id: `click-${step.id}`,
    cx: step.clickX,
    cy: step.clickY,
    rx: radius,
    ry: radius,
    stroke: PALETTE[0],
    strokeWidth: Math.max(4, Math.round(short / 320)),
  };
}

/**
 * 초안을 처음 받았을 때 한 번 — 이미지 단계마다 클릭 위치 동그라미를 기본 주석으로 넣는다.
 * 이미 문서가 있는 단계(같은 창에서 다시 부른 경우)는 건드리지 않는다.
 * 기본 주석은 "편집" 으로 세지 않는다(version 그대로) — 저장 여부 판단은 녹화 자체가 미저장이라 무관.
 */
export function seedClickCircles(steps: GuideDraftStep[]): void {
  for (const step of steps) {
    if (step.kind !== 'image' || docs.has(step.id)) continue;
    docs.set(step.id, { shapes: [clickCircle(step)], past: [], future: [], nextStepNum: 1 });
  }
}

export function subscribeAnnotations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAnnotationVersion(): number {
  return version;
}

/**
 * 텍스트 인라인 편집 중이면 그 내용을 store 에 확정한다 — editor TextEditor 의 commit 과 같은
 * 결과(빈 텍스트면 삭제). 단계 전환·저장 직전에 부른다. (GIF 스튜디오 annotation-tools 와 같은
 * 이유: 창이 포커스를 잃으면 textarea blur 가 오지 않아 blur 에 기대면 글자가 빠진다.)
 */
function commitPendingText(): void {
  const st = useEditorStore.getState();
  const id = st.editingId;
  if (id === null) return;
  const textarea = document.querySelector<HTMLTextAreaElement>('.stage-wrap textarea');
  if (!textarea) throw new Error('스텝 가이드 — 텍스트 편집 중인데 textarea 가 없다.');
  const text = textarea.value.trim();
  if (text) st.updateShape(id, { text });
  else st.deleteShape(id);
  st.setEditingId(null);
  st.setTool('select');
}

/** 지금 에디터 store 의 도형·기록을 현재 단계 문서로 보관한다. */
export function commitCurrent(): void {
  if (currentId === null) return;
  commitPendingText();
  const st = useEditorStore.getState();
  const untouched = loaded !== null &&
    loaded.shapes === st.shapes && loaded.past === st.past && loaded.future === st.future;
  if (untouched) return;
  loaded = { shapes: st.shapes, past: st.past, future: st.future };
  docs.set(currentId, {
    shapes: st.shapes,
    past: st.past,
    future: st.future,
    nextStepNum: st.nextStepNum,
  });
}

/** 단계를 에디터에 띄운다 — 지금 단계를 보관하고 그 단계의 배경·도형·기록을 넣는다. */
export function openStep(step: AnnotatableStep): void {
  if (currentId === step.id) return;
  commitCurrent();
  const doc = docs.get(step.id) ?? { shapes: [], past: [], future: [], nextStepNum: 1 };
  currentId = step.id;
  loaded = { shapes: doc.shapes, past: doc.past, future: doc.future };
  swapping = true;
  try {
    const st = useEditorStore.getState();
    // loadImage 가 배경과 크기를 바꾸며 도형·기록을 비운다 → 이 단계 문서로 다시 채운다.
    st.loadImage(step.imageDataUrl, step.width, step.height);
    useEditorStore.setState({
      shapes: doc.shapes,
      past: doc.past,
      future: doc.future,
      nextStepNum: doc.nextStepNum,
    });
  } finally {
    swapping = false;
  }
}

/** 에디터에서 내린다(GIF 단계 선택·단계 없음) — 지금 단계를 보관하고 편집 대상을 비운다. */
export function closeStep(): void {
  commitCurrent();
  currentId = null;
  loaded = null;
}

/** 단계 삭제 — 그 단계 문서를 버린다(편집 중이면 에디터에서도 내린다). */
export function discardStep(id: string): void {
  if (currentId === id) {
    currentId = null;
    loaded = null;
  }
  if (docs.delete(id)) {
    version += 1;
    notify();
  }
}

/** 저장용 — 단계의 확정된 도형. 주석이 없으면 빈 배열. 부르기 전에 commitCurrent 를 한다. */
export function shapesOf(id: string): Shape[] {
  return docs.get(id)?.shapes ?? [];
}
