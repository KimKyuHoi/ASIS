/** 크롭 영역 — 이미지 논리 좌표(Stage 좌표계). w·h 는 항상 양수로 정규화해 보관한다. */
export type CropRect = { x: number; y: number; w: number; h: number };

/** 배경 이미지 한 장 — 크롭 적용·undo 가 통째로 바꿔 끼우는 단위. */
export type BaseImage = { src: string; width: number; height: number };

/**
 * 크롭 undo/redo 표식 — "past 길이가 at 이 되는 순간 이 이미지로 바뀌었다".
 * shapes 기록(past/future: Shape[][])과 따로 쌓되 past 길이로 서로를 맞춘다.
 * past/future 타입을 그대로 두는 이유: gif-studio frame-docs·step-guide step-annotations 가
 * 그 배열을 직접 보관·교체한다 — 두 화면은 크롭을 쓰지 않아 표식이 늘 비어 있다.
 */
export type CropMark = { at: number; image: BaseImage };
