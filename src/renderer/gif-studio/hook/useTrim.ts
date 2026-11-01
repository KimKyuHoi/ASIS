import { useState } from 'react';
import { setFocusTime } from '../lib/frame-docs';

/** 트림 구간 state — 경계를 옮기면 새 격자에서 그 경계 프레임을 편집하도록 알린다. */
export function useTrim(duration: number): {
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
} {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(duration);
  const onChange = (s: number, e: number): void => {
    // 실제로 옮긴 경계만 — 끝까지 당겨 값이 그대로면 아무것도 남기지 않는다.
    if (s !== start) setFocusTime(s);
    else if (e !== end) setFocusTime(e);
    setStart(s);
    setEnd(e);
  };
  return { start, end, onChange };
}
