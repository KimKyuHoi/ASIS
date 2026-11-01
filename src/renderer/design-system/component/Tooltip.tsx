import { useId, useRef, useState, type JSX, type ReactNode } from 'react';
import '../asset/tooltip.css';

/** macOS 툴팁처럼 잠깐 머문 뒤에 뜬다. 키보드 포커스는 바로 띄운다. */
const HOVER_DELAY_MS = 600;

type TriggerProps = { 'aria-describedby': string };

type TooltipProps = {
  content: string;
  /** 트리거에 aria-describedby 를 붙이도록 props 를 넘겨준다. */
  children: (triggerProps: TriggerProps) => ReactNode;
  placement?: 'top' | 'bottom';
};

export function Tooltip({ content, children, placement = 'bottom' }: TooltipProps): JSX.Element {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const clearTimer = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (delay: number): void => {
    clearTimer();
    timer.current = window.setTimeout(() => {
      setOpen(true);
    }, delay);
  };
  const hide = (): void => {
    clearTimer();
    setOpen(false);
  };

  return (
    <span
      className="ds-tooltip"
      onMouseEnter={(): void => {
        show(HOVER_DELAY_MS);
      }}
      onMouseLeave={hide}
      onFocus={(): void => {
        show(0);
      }}
      onBlur={hide}
      onKeyDown={(event): void => {
        if (event.key === 'Escape') hide();
      }}
    >
      {children({ 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        className={`ds-tooltip__bubble ds-tooltip__bubble--${placement}`}
        data-open={open}
      >
        {content}
      </span>
    </span>
  );
}
