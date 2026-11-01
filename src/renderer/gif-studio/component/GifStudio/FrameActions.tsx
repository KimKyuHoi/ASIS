import type { JSX } from 'react';
import { Button, Icon, IconButton } from '../../../design-system/component';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { useFrames } from '../../hook/useFrames';
import type { FrameNav } from '../../hook/useFrameNav';
import { clearCurrent, copyCurrentTo } from '../../lib/frame-docs';
import { gifStudioStrings } from '../../lib/strings';

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * 프레임 이동 + 지금 프레임 주석을 다른 프레임에 복사하는 보조 기능.
 * 기본 단위는 프레임 하나 — 같은 주석을 여러 프레임에 반복해 그리지 않게 해 준다.
 */
export function FrameActions({ nav }: { nav: FrameNav }): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  const { grid, current, selection, annotated } = useFrames();
  const hasShapes = annotated.has(current);
  const selectionLabel = selection === null
    ? t.copyToSelection
    : t.copyToSelectionN(selection.from + 1, selection.to + 1);
  return (
    <div className="frame-actions">
      <div className="frame-actions__nav">
        <IconButton
          label={t.prevFrame}
          disabled={current === 0}
          icon={<span className="chevron chevron--prev"><Icon name="chevron" /></span>}
          onClick={(): void => nav.step(-1)}
        />
        <IconButton
          label={t.nextFrame}
          disabled={current === grid.count - 1}
          icon={<span className="chevron chevron--next"><Icon name="chevron" /></span>}
          onClick={(): void => nav.step(1)}
        />
      </div>
      <Button disabled={!hasShapes || current === 0} onClick={(): void => {
        copyCurrentTo([current - 1]);
      }}
      >
        {t.copyToPrev}
      </Button>
      <Button disabled={!hasShapes || current === grid.count - 1} onClick={(): void => {
        copyCurrentTo([current + 1]);
      }}
      >
        {t.copyToNext}
      </Button>
      <Button
        disabled={!hasShapes || selection === null}
        title={t.selectionHint}
        onClick={(): void => {
          if (selection === null) return;
          copyCurrentTo(range(selection.from, selection.to));
        }}
      >
        {selectionLabel}
      </Button>
      <Button disabled={!hasShapes} onClick={(): void => {
        copyCurrentTo(range(0, grid.count - 1));
      }}
      >
        {t.copyToAll}
      </Button>
      <Button variant="destructive" disabled={!hasShapes} onClick={clearCurrent}>
        {t.clearFrame}
      </Button>
    </div>
  );
}
