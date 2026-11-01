import { useRef, type JSX, type PointerEvent } from 'react';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { useFrames } from '../../hook/useFrames';
import type { FrameNav } from '../../hook/useFrameNav';
import { setSelection } from '../../lib/frame-docs';
import { gifStudioStrings } from '../../lib/strings';

/**
 * 프레임 바 — GIF 의 프레임을 가로로 늘어놓은 막대. 눌러서 그 프레임을 편집하고,
 * shift+클릭으로 지금 프레임부터 그 프레임까지 구간을 고른다. 점은 주석이 있는 프레임.
 */
export function FrameBar({ nav }: { nav: FrameNav }): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  const { grid, current, selection, annotated } = useFrames();
  const barRef = useRef<HTMLDivElement>(null);
  const pct = (k: number): string => `${(k / grid.count) * 100}%`;
  const width = `${100 / grid.count}%`;

  const frameAtPointer = (e: PointerEvent<HTMLDivElement>): number => {
    const bar = barRef.current;
    if (!bar) throw new Error('프레임 바 — ref 가 없다.');
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(0.9999, Math.max(0, (e.clientX - rect.left) / rect.width));
    return Math.floor(ratio * grid.count);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    const k = frameAtPointer(e);
    if (e.shiftKey) {
      setSelection({ from: Math.min(current, k), to: Math.max(current, k) });
      return;
    }
    setSelection(null);
    nav.goTo(k);
  };

  return (
    <div className="frame-bar">
      <span className="frame-bar__label">{t.frameCounter(current + 1, grid.count)}</span>
      <div
        ref={barRef}
        className="frame-bar__track"
        role="slider"
        aria-label={t.frames}
        aria-valuemin={1}
        aria-valuemax={grid.count}
        aria-valuenow={current + 1}
        onPointerDown={onPointerDown}
      >
        {selection === null ? null : (
          <div
            className="frame-bar__selection"
            style={{ left: pct(selection.from), width: pct(selection.to - selection.from + 1) }}
          />
        )}
        {[...annotated].map((k) => (
          <span key={k} className="frame-bar__dot" style={{ left: pct(k + 0.5) }} />
        ))}
        <div className="frame-bar__current" style={{ left: pct(current), width }} />
      </div>
    </div>
  );
}
