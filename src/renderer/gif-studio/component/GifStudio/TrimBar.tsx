import { useRef, type JSX } from 'react';
import { usePlayhead } from '../../hook/usePlayhead';
import { useTrimDrag } from '../../hook/useTrimDrag';
import { formatDuration } from '../../lib/format-media';

/**
 * 필름스트립 트림 바 — 노란 테두리 구간 + 양끝 핸들, 재생 위치 표시.
 * 바 아무 곳이나 누르면 그 위치로 seek, 핸들을 끌면 구간을 바꾼다.
 */
export function TrimBar({
  filmstripUrl,
  duration,
  start,
  end,
  labels,
  onChange,
  onSeek,
}: {
  filmstripUrl: string;
  duration: number;
  start: number;
  end: number;
  labels: { start: string; end: string };
  onChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
}): JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  // 재생선 — 매 프레임 바뀌므로 상위가 아니라 여기서 구독한다.
  const currentTime = usePlayhead();
  const drag = useTrimDrag(barRef, { duration, start, end, onChange, onSeek });
  const pct = (t: number): string => `${(t / duration) * 100}%`;

  return (
    <div className="trim">
      <div
        ref={barRef}
        className="trim__bar"
        style={{ backgroundImage: `url(${filmstripUrl})` }}
        onPointerDown={(e): void => drag.begin('seek', e)}
        onPointerMove={drag.move}
        onPointerUp={drag.end}
        onPointerCancel={drag.end}
        onLostPointerCapture={drag.lost}
      >
        <div className="trim__dim" style={{ left: 0, width: pct(start) }} />
        <div className="trim__dim" style={{ left: pct(end), right: 0 }} />
        <div className="trim__range" style={{ left: pct(start), width: pct(end - start) }}>
          <span
            className="trim__handle trim__handle--start"
            role="slider"
            aria-label={labels.start}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={start}
            onPointerDown={(e): void => drag.begin('start', e)}
          />
          <span
            className="trim__handle trim__handle--end"
            role="slider"
            aria-label={labels.end}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={end}
            onPointerDown={(e): void => drag.begin('end', e)}
          />
        </div>
        <div className="trim__playhead" style={{ left: pct(currentTime) }} />
      </div>
      <div className="trim__times">
        <span>{formatDuration(start)}</span>
        <span>{formatDuration(end)}</span>
      </div>
    </div>
  );
}
