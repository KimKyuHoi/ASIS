/**
 * 에디터 편집본 — 주석을 합치지 않은 배경 이미지 + 도형 데이터. 캡처 히스토리 [편집]으로
 * 다시 열어 도형을 그대로 고친다. main(캡처 히스토리)·preload(IPC 타입)·renderer(editor) 공용.
 *
 * 배경은 크롭이 반영된 주석 없는 PNG data URL 이라 블러·모자이크는 열 때 원본 픽셀에서
 * 다시 계산된다.
 *
 * 들어오는 값(IPC)은 신뢰하지 않는다 — parseEditorProject 가 버전·크기·도형 필드를 검사하고
 * 틀리면 어디가 틀렸는지 담아 throw 한다 (조용히 고치지 않는다).
 */

export const EDITOR_PROJECT_VERSION = 1;

/** 도형 한 개 — 정확한 형태는 renderer/editor/types/shapes.ts 의 Shape. 여기서는 필드 검사만. */
export type EditorProjectShape = Record<string, unknown> & { kind: string; id: string };

export type EditorProjectData = {
  version: typeof EDITOR_PROJECT_VERSION;
  /** width·height 는 에디터 논리 크기 (물리 픽셀 / 캡처 당시 배율, 소수 가능). */
  image: { dataUrl: string; width: number; height: number };
  shapes: EditorProjectShape[];
  nextStepNum: number;
};

type ShapeSpec = {
  nums: readonly string[];
  strs: readonly string[];
  /** points 배열 최소 길이 (polyline 종류만) */
  minPoints?: number;
  optionalNums?: readonly string[];
  optionalStrs?: readonly string[];
};

const BOX = ['x', 'y', 'w', 'h'];
const STROKE = ['strokeWidth'];

/**
 * 종류별 필수 필드 — renderer/editor/types/shapes.ts 와 맞춘다.
 * renderer(lib/editor-project.ts)가 키 집합이 Shape['kind'] 와 같은지 타입으로 검사한다.
 */
export const PROJECT_SHAPE_SPECS = {
  rect: { nums: [...BOX, ...STROKE], strs: ['stroke'], optionalNums: ['rotation'] },
  ellipse: { nums: ['cx', 'cy', 'rx', 'ry', ...STROKE], strs: ['stroke'], optionalNums: ['rotation'] },
  arrow: { nums: STROKE, strs: ['stroke'], minPoints: 4, optionalNums: ['rotation'] },
  line: { nums: STROKE, strs: ['stroke'], minPoints: 4, optionalNums: ['rotation'] },
  pen: { nums: STROKE, strs: ['stroke'], minPoints: 2, optionalNums: ['rotation'] },
  text: {
    nums: ['x', 'y', 'width', 'fontSize'],
    strs: ['text', 'fill', 'fontFamily'],
    optionalNums: ['height', 'lineHeight'],
    optionalStrs: ['align'],
  },
  highlight: { nums: BOX, strs: ['fill'] },
  blur: { nums: [...BOX, 'blurRadius'], strs: [] },
  mosaic: { nums: [...BOX, 'blockSize'], strs: [] },
  image: { nums: BOX, strs: ['src'], optionalNums: ['rotation'] },
  step: { nums: ['x', 'y', 'num', 'fontSize'], strs: ['fill'] },
} as const satisfies Record<string, ShapeSpec>;

export type ProjectShapeKind = keyof typeof PROJECT_SHAPE_SPECS;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(o: Obj, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${where}.${key}: 숫자가 아님`);
  return v;
}

function str(o: Obj, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`${where}.${key}: 문자열이 아님`);
  return v;
}

/** 선택 필드 — 없으면 통과, 있으면 type 이어야 한다. */
function optional(o: Obj, [key, type]: [string, 'number' | 'string'], where: string): void {
  const v = o[key];
  if (v !== undefined && typeof v !== type) throw new Error(`${where}.${key}: ${type} 이 아님`);
}

function points(o: Obj, where: string, min: number): void {
  const v = o.points;
  const ok = Array.isArray(v) && v.length >= min && v.length % 2 === 0 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n));
  if (!ok) throw new Error(`${where}.points: 짝수 길이 숫자 배열이 아님`);
}

function isKind(kind: string): kind is ProjectShapeKind {
  return Object.hasOwn(PROJECT_SHAPE_SPECS, kind);
}

function checkShape(o: Obj, where: string): EditorProjectShape {
  const id = str(o, 'id', where);
  const kind = str(o, 'kind', where);
  if (!isKind(kind)) throw new Error(`${where}.kind: 알 수 없는 도형 '${kind}'`);
  const spec: ShapeSpec = PROJECT_SHAPE_SPECS[kind];
  spec.nums.forEach((k) => num(o, k, where));
  spec.strs.forEach((k) => str(o, k, where));
  // optionalNums/Strs 는 표에서 생략 가능한 칸 — 없으면 검사할 선택 필드가 없다는 뜻.
  (spec.optionalNums ?? []).forEach((k) => optional(o, [k, 'number'], where));
  (spec.optionalStrs ?? []).forEach((k) => optional(o, [k, 'string'], where));
  // dash 는 stroked 도형 공통 선택 필드.
  optional(o, ['dash', 'string'], where);
  if (spec.minPoints !== undefined) points(o, where, spec.minPoints);
  return { ...o, kind, id };
}

/** JSON 으로 읽은 값을 프로젝트로 검증한다. 틀리면 throw. */
export function parseEditorProject(value: unknown): EditorProjectData {
  if (!isObj(value)) throw new Error('project: 객체가 아님');
  if (value.version !== EDITOR_PROJECT_VERSION) {
    throw new Error(`project.version: 지원하지 않는 버전 ${String(value.version)}`);
  }
  const image = value.image;
  if (!isObj(image)) throw new Error('project.image: 객체가 아님');
  const dataUrl = str(image, 'dataUrl', 'project.image');
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('project.image.dataUrl: 이미지 data URL 이 아님');
  }
  const width = num(image, 'width', 'project.image');
  const height = num(image, 'height', 'project.image');
  if (!(width > 0) || !(height > 0)) throw new Error('project.image: 크기가 0 이하');
  if (!Array.isArray(value.shapes)) throw new Error('project.shapes: 배열이 아님');
  const shapes = value.shapes.map((s: unknown, i) => {
    const where = `project.shapes[${String(i)}]`;
    if (!isObj(s)) throw new Error(`${where}: 객체가 아님`);
    return checkShape(s, where);
  });
  const nextStepNum = num(value, 'nextStepNum', 'project');
  return {
    version: EDITOR_PROJECT_VERSION,
    image: { dataUrl, width, height },
    shapes,
    nextStepNum,
  };
}
