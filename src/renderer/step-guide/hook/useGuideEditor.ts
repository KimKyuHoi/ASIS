import { useReducer } from 'react';
import type { GuideDraft, GuideDraftStep, GuideEdits } from '../../../shared/step-guide';

/**
 * 스텝 가이드 편집 창의 상태 — 제목·설명·단계(문장/설명/순서/삭제)·선택.
 *
 * 이미지는 main 이 들고 있으므로 저장 때는 텍스트와 순서(GuideEdits)만 보낸다.
 * savedSnapshot 은 마지막으로 저장한 GuideEdits 의 JSON — 처음엔 '' 라서
 * 한 번도 저장하지 않은 녹화는 "미저장"으로 본다(닫으면 녹화 자체를 잃으므로).
 */
export type GuideEditorState = {
  title: string;
  description: string;
  steps: GuideDraftStep[];
  /** 선택된 단계. 단계를 모두 지웠을 때만 null. */
  selectedId: string | null;
  savedSnapshot: string;
};

export type GuideEditorAction =
  | { type: 'title'; value: string } |
  { type: 'description'; value: string } |
  { type: 'caption'; id: string; value: string } |
  { type: 'note'; id: string; value: string } |
  { type: 'select'; id: string } |
  { type: 'move'; id: string; to: number } |
  { type: 'remove'; id: string } |
  { type: 'saved'; snapshot: string };

function init(draft: GuideDraft): GuideEditorState {
  return {
    title: draft.title,
    description: draft.description,
    steps: draft.steps,
    selectedId: draft.steps.length > 0 ? draft.steps[0].id : null,
    savedSnapshot: '',
  };
}

function updateStep(
  steps: GuideDraftStep[],
  id: string,
  patch: Partial<Pick<GuideDraftStep, 'caption' | 'note'>>,
): GuideDraftStep[] {
  return steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

function moveStep(steps: GuideDraftStep[], id: string, to: number): GuideDraftStep[] {
  const from = steps.findIndex((s) => s.id === id);
  if (from < 0) throw new Error(`moveStep: 없는 단계 id — ${id}`);
  const target = Math.max(0, Math.min(steps.length - 1, to));
  if (target === from) return steps;
  const next = steps.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

function removeStep(state: GuideEditorState, id: string): GuideEditorState {
  const index = state.steps.findIndex((s) => s.id === id);
  if (index < 0) throw new Error(`removeStep: 없는 단계 id — ${id}`);
  const steps = state.steps.filter((s) => s.id !== id);
  if (state.selectedId !== id) return { ...state, steps };
  // 지운 단계가 선택돼 있었으면 같은 자리(없으면 바로 위) 단계를 고른다.
  const neighbor = steps.at(Math.min(index, steps.length - 1));
  return { ...state, steps, selectedId: neighbor ? neighbor.id : null };
}

function reducer(state: GuideEditorState, action: GuideEditorAction): GuideEditorState {
  switch (action.type) {
    case 'title':
      return { ...state, title: action.value };
    case 'description':
      return { ...state, description: action.value };
    case 'caption':
      return { ...state, steps: updateStep(state.steps, action.id, { caption: action.value }) };
    case 'note':
      return { ...state, steps: updateStep(state.steps, action.id, { note: action.value }) };
    case 'select':
      return { ...state, selectedId: action.id };
    case 'move':
      return { ...state, steps: moveStep(state.steps, action.id, action.to) };
    case 'remove':
      return removeStep(state, action.id);
    case 'saved':
      return { ...state, savedSnapshot: action.snapshot };
    default: {
      const unknown: never = action;
      throw new Error(`useGuideEditor: 알 수 없는 action — ${JSON.stringify(unknown)}`);
    }
  }
}

/** main 으로 보낼 편집 결과 — 배열 순서가 최종 순서. */
function toEdits(state: GuideEditorState): GuideEdits {
  return {
    title: state.title,
    description: state.description,
    // 합성 이미지는 저장 직전에만 만든다(lib/annotated-edits) — 여기선 텍스트·순서만.
    steps: state.steps.map((s) => ({
      id: s.id,
      caption: s.caption,
      note: s.note,
      annotatedImageDataUrl: null,
    })),
  };
}

/**
 * @param annotationVersion 주석 변경 횟수(lib/step-annotations) — 텍스트 편집과 함께
 *   "저장 후 바뀌었는가" 판단(snapshot)에 섞는다.
 */
export function useGuideEditor(draft: GuideDraft, annotationVersion: number): {
  state: GuideEditorState;
  dispatch: (action: GuideEditorAction) => void;
  edits: GuideEdits;
  snapshot: string;
  dirty: boolean;
} {
  const [state, dispatch] = useReducer(reducer, draft, init);
  const edits = toEdits(state);
  const snapshot = `${JSON.stringify(edits)}#${annotationVersion}`;
  return { state, dispatch, edits, snapshot, dirty: snapshot !== state.savedSnapshot };
}
