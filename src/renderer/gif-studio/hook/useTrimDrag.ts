import { useRef, type PointerEvent, type RefObject } from 'react';
import { MIN_TRIM } from '../lib/export-settings';

export type DragTarget = 'start' | 'end' | 'seek';

type Range = {
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
};

/**
 * 트림 바 드래그 — 핸들(start/end)은 구간을, 바 본체는 재생 위치를 바꾼다.
 * pointer capture 를 바에 걸어 핸들 밖으로 끌어도 이벤트를 놓치지 않는다.
 */
export function useTrimDrag(barRef: RefObject<HTMLDivElement | null>, range: Range): {
  begin: (target: DragTarget, e: PointerEvent<HTMLElement>) => void;
  move: (e: PointerEvent<HTMLDivElement>) => void;
  end: (e: PointerEvent<HTMLDivElement>) => void;
  /** 캡처를 잃으면(창 밖 놓기·다른 요소가 가져감) 드래그를 끝낸다 — 남으면 hover 만으로 트림이 움직인다. */
  lost: () => void;
} {
  const dragRef = useRef<DragTarget | null>(null);
  const { duration, start, end, onChange, onSeek } = range;

  const requireBar = (): HTMLDivElement => {
    const bar = barRef.current;
    if (!bar) throw new Error('TrimBar — bar ref 가 없다.');
    return bar;
  };

  const timeAt = (clientX: number): number => {
    const rect = requireBar().getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  // 경계를 옮길 때는 seek 을 먼저 — seek(프레임 이동)이 남은 트림 시각을 비우므로, 그 뒤에
  // onChange 가 새 경계 시각을 남겨야 격자가 바뀔 때 그 경계 프레임을 편집한다 (frame-docs focusTime).
  const apply = (target: DragTarget, time: number): void => {
    if (target === 'start') {
      const next = Math.max(0, Math.min(time, end - MIN_TRIM));
      onSeek(next);
      onChange(next, end);
    } else if (target === 'end') {
      const next = Math.min(duration, Math.max(time, start + MIN_TRIM));
      onSeek(next);
      onChange(start, next);
    } else {
      onSeek(Math.min(end, Math.max(start, time)));
    }
  };

  return {
    begin: (target, e): void => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = target;
      requireBar().setPointerCapture(e.pointerId);
      apply(target, timeAt(e.clientX));
    },
    move: (e): void => {
      const target = dragRef.current;
      // 캡처를 잃으면 lost() 가 dragRef 를 비운다. up 을 못 받은 채(⌘Tab·시트) 버튼이 이미
      // 떼어졌다면 여기서 끝낸다 — hover 만으로 트림이 움직이지 않게.
      if (target === null) return;
      if (e.buttons === 0) {
        dragRef.current = null;
        return;
      }
      apply(target, timeAt(e.clientX));
    },
    end: (e): void => {
      if (dragRef.current === null) return;
      dragRef.current = null;
      requireBar().releasePointerCapture(e.pointerId);
    },
    lost: (): void => {
      dragRef.current = null;
    },
  };
}
