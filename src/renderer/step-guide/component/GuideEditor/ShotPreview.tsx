import type { JSX } from 'react';
import type { GuideDraftStep } from '../../../../shared/step-guide';

type Props = { step: GuideDraftStep; alt: string };

/**
 * 주석을 넣지 않는 단계(GIF)의 화면 — 애니메이션 그대로 보여 준다.
 * 이미지 단계는 StepCanvas(이미지 에디터)가 맡고, 클릭 표시도 거기서 기본 주석으로 들어간다.
 */
export default function ShotPreview({ step, alt }: Props): JSX.Element {
  return (
    <figure className="ge-shot">
      <img src={step.imageDataUrl} alt={alt} width={step.width} height={step.height} />
    </figure>
  );
}
