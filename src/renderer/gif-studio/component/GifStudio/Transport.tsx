import type { JSX } from 'react';
import { useLanguage } from '../../../../shared/i18n/use-language';
import type { FrameNav } from '../../hook/useFrameNav';
import { gifStudioStrings } from '../../lib/strings';
import { TrimBar } from './TrimBar';

/** 재생/일시정지 + 필름스트립 트림 바. 트림 바를 누르면 그 시각의 프레임을 편집한다. */
export function Transport({
  nav,
  filmstripUrl,
  duration,
  trim,
}: {
  nav: FrameNav;
  filmstripUrl: string;
  duration: number;
  trim: { start: number; end: number; onChange: (start: number, end: number) => void };
}): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  const playLabel = nav.playing ? t.pause : t.play;
  return (
    <div className="transport">
      <button
        type="button"
        className="transport__play"
        onClick={nav.togglePlay}
        aria-label={playLabel}
        title={playLabel}
      >
        {nav.playing ? '❚❚' : '▶'}
      </button>
      <TrimBar
        filmstripUrl={filmstripUrl}
        duration={duration}
        start={trim.start}
        end={trim.end}
        labels={{ start: t.trimStart, end: t.trimEnd }}
        onChange={trim.onChange}
        onSeek={nav.seekTime}
      />
    </div>
  );
}
