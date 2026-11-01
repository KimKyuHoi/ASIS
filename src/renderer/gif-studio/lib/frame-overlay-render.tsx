import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Layer, Stage } from 'react-konva';
import Konva from 'konva';
import { Shape } from '../../editor/component/Shape';
import { stageToDataUrl } from '../../editor/lib/editor-actions';
import { backgroundFor } from '../../editor/lib/background';
import type { Shape as ShapeData } from '../../editor/types/shapes';

const SETTLE_TIMEOUT_MS = 3000;

/**
 * 한 프레임의 도형을 원본 크기 투명 PNG 로 굽는다 — 화면에 없는 Stage 를 잠깐 만들어
 * 이미지 에디터의 Shape 렌더러를 그대로 쓴다 (블러·모자이크·이미지·텍스트 모두 같은 모양).
 *
 * Shape 일부는 마운트 뒤 비동기로 준비된다 — 이미지 도형은 src 디코딩, 블러는 cache().
 * 그래서 그린 직후가 아니라, 필요한 Konva.Image 가 모두 이미지를 갖출 때까지 기다린다.
 *
 * @param bgImage 블러·모자이크가 잘라 쓸 이 프레임의 정지화면 (그 도형이 없으면 null 가능)
 */
export async function renderFrameOverlay(
  shapes: ShapeData[],
  bgImage: HTMLImageElement | null,
  size: { width: number; height: number },
): Promise<string> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  const stageBox: { current: Konva.Stage | null } = { current: null };
  // 블러·모자이크가 자를 배율은 이 프레임 정지화면 ÷ 굽는 크기 — 에디터 store 와 무관.
  const background = bgImage ? backgroundFor(bgImage, size.width) : null;
  try {
    flushSync(() => {
      root.render(
        <Stage
          ref={(s): void => {
            stageBox.current = s;
          }}
          width={size.width}
          height={size.height}
          listening={false}
        >
          <Layer>
            {shapes.map((s) => (
              <Shape
                key={s.id}
                shape={s}
                selected={false}
                background={background}
                onSelect={noop}
              />
            ))}
          </Layer>
        </Stage>,
      );
    });
    const stage = stageBox.current;
    if (!stage) throw new Error('GIF 스튜디오 — 오프스크린 Stage 가 만들어지지 않았다.');
    await waitForImages(stage, shapes.filter(needsImage));
    return stageToDataUrl(stage, 1);
  } finally {
    root.unmount();
    host.remove();
  }
}

function noop(): void {
  // 오프스크린 렌더 — 선택 이벤트를 받지 않는다.
}

/** 마운트 뒤 비동기로 준비되는 도형 — 이미지(src 디코딩)·블러(cache)·모자이크(배경 crop). */
function needsImage(shape: ShapeData): boolean {
  return shape.kind === 'image' || shape.kind === 'blur' || shape.kind === 'mosaic';
}

/** 도형 노드가 다 그려질 준비가 됐는가 — id 로 노드를 찾아 하나씩 본다 (개수로 세면 섞인다). */
function isReady(stage: Konva.Stage, shape: ShapeData): boolean {
  const node = stage.findOne(`#${shape.id}`);
  // 배경이 없으면 블러·모자이크는 KRect 자리표시 — Konva.Image 가 아니면 아직이다.
  if (!(node instanceof Konva.Image) || node.image() === undefined) return false;
  return shape.kind !== 'blur' || node.isCached();
}

/** passive effect(이미지 onload → setState, blur cache)가 돌 틈을 주며 다시 확인한다. */
async function waitForImages(
  stage: Konva.Stage,
  pending: ShapeData[],
  started = Date.now(),
): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 16));
  const left = pending.filter((s) => !isReady(stage, s));
  if (left.length === 0) return;
  if (Date.now() - started > SETTLE_TIMEOUT_MS) {
    throw new Error(`GIF 스튜디오 — 주석 이미지 준비 시간 초과 (${left.map((s) => s.kind).join(', ')})`);
  }
  await waitForImages(stage, left, started);
}
