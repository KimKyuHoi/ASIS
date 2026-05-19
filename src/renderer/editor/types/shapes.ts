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
  'line' |
  'pen' |
  'text' |
  'highlight' |
  'blur' |
  'mosaic' |
  'eraser' |
  'step';

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

export type LineShape = Stroked & Rotatable & {
  kind: 'line';
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
  /** Stage 좌표계 너비 — 이 값으로 줄넘김 경계를 결정. */
  width: number;
  text: string;
  fill: string;
  fontSize: number;
  fontFamily: string;
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

export type MosaicShape = {
  kind: 'mosaic';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 모자이크 블록 크기 (픽셀) */
  blockSize: number;
};

/**
 * 외부 이미지 첨부 — 클립보드 paste / drag-drop / 파일 선택으로 추가.
 * src 는 base64 data URL — store 에 자체 포함 (외부 파일 의존 없음 + export 일관).
 * 큰 이미지는 첨부 시점에 maxDim 으로 thumbnail resize 거쳐 store 부풀림 방지.
 */
export type ImageShape = Rotatable & {
  kind: 'image';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
};

/** 번호 마커 — 원 안에 숫자. x/y 는 원 중심. */
export type StepShape = {
  kind: 'step';
  id: string;
  x: number;
  y: number;
  num: number;
  fill: string;
  fontSize: number;
};

export type Shape =
  | RectShape |
  EllipseShape |
  ArrowShape |
  LineShape |
  PenShape |
  TextShape |
  HighlightShape |
  BlurShape |
  MosaicShape |
  ImageShape |
  StepShape;
