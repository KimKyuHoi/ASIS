/**
 * 디코드가 끝난 배경 이미지 캐시 — data URL → HTMLImageElement.
 *
 * 크롭 적용·undo 로 store 의 imageSrc 가 바뀌면 useEditorImages 가 새 Image 를 onload 까지
 * 기다리는데, 그 사이에는 *옛 bgImage* 가 새 크기로 쓰인다 — 화면이 어긋날 뿐 아니라 export 배율·
 * 블러 배율·다음 크롭 계산까지 틀린다. 그래서 크롭 기록(cropUndo/cropRedo)이 가리키는 배경은
 * 모두 디코드된 채로 들고 있다가 useEditorImages 가 바로 쓰게 한다.
 *
 * 개수 상한 대신 "기록이 가리키는 것만 남김(retainOnly)" 으로 정리한다 — 상한으로 밀어내면
 * 여러 번 크롭한 뒤 원본까지 undo 할 때 캐시가 비어 위 문제가 그대로 난다.
 * 크롭할수록 이미지는 작아지므로 원본 1장 + 그보다 작은 몇 장이다.
 */

const cache = new Map<string, HTMLImageElement>();

export function rememberDecoded(src: string, img: HTMLImageElement): void {
  cache.set(src, img);
}

/** 캐시에 있으면 그 이미지, 없으면 undefined (크롭을 안 했으면 늘 비어 있다). */
export function peekDecoded(src: string): HTMLImageElement | undefined {
  return cache.get(src);
}

/** keep 에 없는 항목을 놓는다 — 더 이상 undo/redo 로 돌아갈 수 없는 배경. */
export function retainOnly(keep: ReadonlySet<string>): void {
  for (const src of [...cache.keys()]) {
    if (!keep.has(src)) cache.delete(src);
  }
}

/** 새 캡처·편집본을 열 때 — 이전 세션 이미지를 놓는다. */
export function clearDecoded(): void {
  cache.clear();
}
