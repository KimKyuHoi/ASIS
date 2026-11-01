import type { JSX } from 'react';
import { Layer, Stage } from 'react-konva';
import { Shape } from '../../../editor/component/Shape';
import { usePlayhead } from '../../hook/usePlayhead';
import { useFrames } from '../../hook/useFrames';
import { frameShownAt } from '../../lib/frame-grid';
import { shapesOf } from '../../lib/frame-docs';

function noop(): void {
  // 재생 중 미리보기는 읽기 전용 — 선택을 받지 않는다.
}

/**
 * 재생 중 영상 위에 지금 프레임의 주석을 읽기 전용으로 겹쳐 보여 준다.
 * 블러·모자이크는 배경 정지화면이 없어(재생 중) 빈 영역으로 보이고, 내보낸 GIF 에는
 * 그 프레임 픽셀로 제대로 구워진다.
 */
export function PlaybackOverlay({
  scale,
  width,
  height,
}: {
  scale: number;
  width: number;
  height: number;
}): JSX.Element {
  const playhead = usePlayhead();
  const { grid } = useFrames();
  const shapes = shapesOf(frameShownAt(grid, playhead));
  return (
    <Stage
      className="playback-overlay"
      width={width * scale}
      height={height * scale}
      scaleX={scale}
      scaleY={scale}
      listening={false}
    >
      <Layer>
        {shapes.map((s) => (
          <Shape key={s.id} shape={s} selected={false} background={null} onSelect={noop} />
        ))}
      </Layer>
    </Stage>
  );
}
