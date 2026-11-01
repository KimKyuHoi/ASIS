import { useEditorStore } from './store';
import {
  EDITOR_PROJECT_VERSION,
  parseEditorProject,
  type ProjectShapeKind,
} from '../../../shared/editor-project';
import type { EditorProject } from '../types/project';
import type { Shape } from '../types/shapes';

// shared 의 도형 검증 표(PROJECT_SHAPE_SPECS)가 Shape 종류와 정확히 같은지 컴파일 시점에 확인한다.
// 한쪽에만 종류가 추가되면 true 대입이 타입 에러가 된다. (값 자체는 쓰지 않는다 — 검사 전용)
type SameUnion<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const SHAPE_KINDS_MATCH: SameUnion<Shape['kind'], ProjectShapeKind> = true;

/** 지금 편집 상태를 프로젝트로 — 그리는 중인 도형·선택·undo 기록은 담지 않는다. */
export function snapshotProject(): EditorProject {
  const st = useEditorStore.getState();
  if (st.imageSrc === null || st.imageSrc === '') {
    throw new Error('snapshotProject: 배경 이미지가 없다');
  }
  return {
    version: EDITOR_PROJECT_VERSION,
    image: { dataUrl: st.imageSrc, width: st.imageWidth, height: st.imageHeight },
    shapes: st.shapes,
    nextStepNum: st.nextStepNum,
  };
}

/**
 * IPC 로 받은 값을 프로젝트로 — main 이 이미 검증했지만 renderer 도 신뢰하지 않고 다시 본다.
 * 필드 검사를 통과한 도형은 Shape 로 취급한다 (검사 표와 Shape 종류 일치는 위에서 타입으로 보장).
 */
export function parseProject(value: unknown): EditorProject {
  const data = parseEditorProject(value);
  return { ...data, shapes: data.shapes as unknown as Shape[] };
}

/** 프로젝트를 에디터에 연다 — 배경을 바꾸고 도형을 채운다. 다시 연 상태는 undo 기록이 비어 있다. */
export function openProject(project: EditorProject): void {
  const st = useEditorStore.getState();
  st.loadImage(project.image.dataUrl, project.image.width, project.image.height);
  useEditorStore.setState({ shapes: project.shapes, nextStepNum: project.nextStepNum });
}
