/**
 * 블러·모자이크가 잘라 쓰는 배경 — 이미지와 그 배율.
 * pixelRatio = 이미지 물리 픽셀 / 도형 좌표 단위 (예: Retina 캡처면 2, 스텝 가이드 원본 픽셀 굽기면 1).
 *
 * 배율을 전역 store(imageWidth)에서 읽지 않고 이미지와 한 묶음으로 넘기는 이유: 오프스크린 렌더
 * (스텝 가이드·GIF 스튜디오 굽기)는 지금 에디터에 열린 문서와 크기가 다를 수 있다. 묶어 두면
 * 호출자가 이미지만 넘기고 배율을 빠뜨릴 수 없다.
 */
export type ShapeBackground = { image: HTMLImageElement; pixelRatio: number };
