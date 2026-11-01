import type { EditorProjectData } from '../../../shared/editor-project';
import type { Shape } from './shapes';

/**
 * 에디터 프로젝트 — shared/editor-project.ts 의 EditorProjectData 에서 도형만 Shape 로 좁힌 것.
 * 배경은 크롭이 반영된 *주석 없는* PNG(store 의 imageSrc 그대로)라, 다시 열면 블러·모자이크도
 * 원본 픽셀에서 다시 계산된다.
 */
export type EditorProject = Omit<EditorProjectData, 'shapes'> & { shapes: Shape[] };
