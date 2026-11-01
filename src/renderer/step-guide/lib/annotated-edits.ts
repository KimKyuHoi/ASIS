import type { GuideDraftStep, GuideEdits } from '../../../shared/step-guide';
import { composeAnnotatedImage } from './annotation-render';
import { commitCurrent, shapesOf } from './step-annotations';

/**
 * 저장 직전 — 주석을 그린 이미지 단계마다 원본 + 주석을 합성해 annotatedImageDataUrl 로 채운다.
 * 주석이 없거나 GIF 단계면 null(main 이 원본을 쓴다).
 * 합성은 단계마다 원본 크기 캔버스를 만들므로 한 번에 하나씩 순서대로 한다(메모리 피크를 낮춤).
 */
export async function withAnnotatedImages(
  edits: GuideEdits,
  steps: GuideDraftStep[],
): Promise<GuideEdits> {
  // 지금 편집 중인 단계(텍스트 입력 포함)를 먼저 확정한다.
  commitCurrent();
  const byId = new Map(steps.map((s) => [s.id, s]));
  const out: GuideEdits['steps'] = [];
  for (const e of edits.steps) {
    const step = byId.get(e.id);
    if (!step) throw new Error(`withAnnotatedImages — 편집 결과에 있는 단계가 상태에 없다: ${e.id}`);
    const shapes = step.kind === 'image' ? shapesOf(step.id) : [];
    const size = { width: step.width, height: step.height };
    const annotatedImageDataUrl = shapes.length === 0
      ? null
      // eslint-disable-next-line no-await-in-loop -- 원본 크기 캔버스를 한 번에 하나만 만든다.
      : await composeAnnotatedImage(step.imageDataUrl, shapes, size);
    out.push({ ...e, annotatedImageDataUrl });
  }
  return { ...edits, steps: out };
}
