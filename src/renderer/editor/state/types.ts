/**
 * 어노테이션 에디터 도형/도구 타입.
 * 모든 도형은 자기 좌표·스타일을 *Stage 좌표계 (이미지 픽셀)* 로 보관한다.
 * 화면 표시 시 react-konva Stage 의 scale 로 줄여 렌더한다 (Retina 별개).
 */

export type Tool =
  | 'select' |
  'rect' |
  'ellipse' |
  'arrow' |
  'pen' |
  'text' |
  'highlight' |
  'blur';

/** 자유 픽셀 단위 — 슬라이더/단계 모두 호환. */
export type StrokeWidth = number;

type Stroked = {
  stroke: string;
  strokeWidth: number;
};

/** 회전 가능 도형 공통 — Konva 의 rotation 은 도(degrees) 단위. */
type Rotatable = {
  /** 도(degrees) — 시계방향. 미지정 시 0. */
  rotation?: number;
};

export type RectShape = Stroked & Rotatable & {
  kind: 'rect';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EllipseShape = Stroked & Rotatable & {
  kind: 'ellipse';
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

export type ArrowShape = Stroked & Rotatable & {
  kind: 'arrow';
  id: string;
  /** [x1, y1, x2, y2] */
  points: number[];
};

export type PenShape = Stroked & Rotatable & {
  kind: 'pen';
  id: string;
  /** [x1, y1, x2, y2, ...] */
  points: number[];
};

export type TextShape = {
  kind: 'text';
  id: string;
  x: number;
  y: number;
  text: string;
  fill: string;
  fontSize: number;
};

export type HighlightShape = {
  kind: 'highlight';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 반투명 fill (예: rgba(255,235,59,0.4)) */
  fill: string;
};

export type BlurShape = {
  kind: 'blur';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 픽셀 단위 가우시안 반지름 */
  blurRadius: number;
};

export type Shape =
  | RectShape |
  EllipseShape |
  ArrowShape |
  PenShape |
  TextShape |
  HighlightShape |
  BlurShape;
