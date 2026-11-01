import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Image as KImage, Layer, Stage } from 'react-konva';
import Konva from 'konva';
import { Shape } from '../../editor/component/Shape';
import { backgroundFor } from '../../editor/lib/background';
import type { Shape as ShapeData } from '../../editor/types/shapes';

const SETTLE_TIMEOUT_MS = 3000;

/**
 * 단계 이미지에 주석을 합성한 PNG data URL — 화면에 없는 Stage 를 잠깐 만들어 이미지 에디터의
 * Shape 렌더러를 그대로 쓴다(블러·모자이크·이미지·텍스트 모두 편집 화면과 같은 모양).
 * GIF 스튜디오 lib/frame-overlay-render 와 같은 방식이고, 차이는 배경을 함께 굽는다는 것뿐이다.
 *
 * Shape 일부는 마운트 뒤 비동기로 준비된다 — 이미지 도형은 src 디코딩, 블러는 cache().
 * 그래서 그린 직후가 아니라 필요한 Konva.Image 가 모두 이미지를 갖출 때까지 기다린다.
 * 크기는 원본 픽셀 그대로(pixelRatio 1) — 클릭 표시 좌표(이미지 픽셀)와 맞아야 한다.
 */
export async function composeAnnotatedImage(
  baseDataUrl: string,
  shapes: ShapeData[],
  size: { width: number; height: number },
): Promise<string> {
  const bgImage = await loadImage(baseDataUrl);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  const stageBox: { current: Konva.Stage | null } = { current: null };
  // 블러·모자이크가 자를 배율은 *이 단계* 크기 기준 — 에디터 store(지금 화면에 연 단계)와 무관.
  const background = backgroundFor(bgImage, size.width);
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
            <KImage image={bgImage} width={size.width} height={size.height} />
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
    if (!stage) throw new Error('스텝 가이드 — 오프스크린 Stage 가 만들어지지 않았다.');
    await waitForImages(stage, shapes.filter(needsImage));
    resetZoomComp(stage);
    return stage.toDataURL({ x: 0, y: 0, width: size.width, height: size.height, pixelRatio: 1 });
  } finally {
    root.unmount();
    host.remove();
  }
}

/**
 * 줌 시각 보정 되돌리기 — 에디터 Shape 는 화면 줌(effectiveZoom)만큼 선 두께를 나눠 그리고
 * (name="zoom-comp", base* attr), 저장 때는 원본 두께로 되돌려 굽는다(editor-actions
 * stageToDataUrl 과 같은 처리). stageToDataUrl 은 에디터 store 의 *현재* 이미지 크기로 자르므로
 * 단계마다 크기가 다를 수 있는 여기선 쓰지 않고, 같은 attr 규약으로 직접 되돌린다.
 */
function resetZoomComp(stage: Konva.Stage): void {
  stage.find('.zoom-comp').forEach((n) => {
    if (!(n instanceof Konva.Shape)) return;
    const baseStrokeWidth: unknown = n.getAttr('baseStrokeWidth');
    if (typeof baseStrokeWidth === 'number') n.strokeWidth(baseStrokeWidth);
    const basePointer: unknown = n.getAttr('basePointer');
    if (typeof basePointer === 'number' && n instanceof Konva.Arrow) {
      n.pointerLength(basePointer);
      n.pointerWidth(basePointer);
    }
    const baseDash: unknown = n.getAttr('baseDash');
    if (Array.isArray(baseDash)) n.dash(baseDash.filter((d): d is number => typeof d === 'number'));
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      resolve(img);
    };
    img.onerror = (): void => {
      reject(new Error('스텝 가이드 — 단계 이미지를 디코딩하지 못했다.'));
    };
    img.src = src;
  });
}

function noop(): void {
  // 오프스크린 렌더 — 선택 이벤트를 받지 않는다.
}

/** 마운트 뒤 비동기로 준비되는 도형 — 이미지(src 디코딩)·블러(cache)·모자이크(배경 crop). */
function needsImage(shape: ShapeData): boolean {
  return shape.kind === 'image' || shape.kind === 'blur' || shape.kind === 'mosaic';
}

/** 도형 노드가 다 그려질 준비가 됐는가 — id 로 노드를 찾아 하나씩 본다. */
function isReady(stage: Konva.Stage, shape: ShapeData): boolean {
  const node = stage.findOne(`#${shape.id}`);
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
    throw new Error(`스텝 가이드 — 주석 이미지 준비 시간 초과 (${left.map((s) => s.kind).join(', ')})`);
  }
  await waitForImages(stage, left, started);
}
