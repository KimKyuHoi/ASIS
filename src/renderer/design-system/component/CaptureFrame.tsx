import type { CSSProperties, JSX, ReactNode } from 'react';
import { cx } from '../lib/cx';
import '../asset/capture-frame.css';

const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

/**
 * neutral = 캡처할 영역(흰 선) · accent = 자동 감지한 UI 요소 / 확정 순간(브랜드 오렌지)
 * recording = 녹화 중(빨강) · measure = 캡처가 아닌 측정(파랑)
 */
export type CaptureFrameTone = 'neutral' | 'accent' | 'recording' | 'measure';

type CaptureFrameProps = {
  width: number;
  height: number;
  tone?: CaptureFrameTone;
  /** 크기 칩 표시 (예: 1280 × 720) */
  showSize?: boolean;
  children?: ReactNode;
  className?: string;
};

/**
 * ASIS 시그니처 — 캡처 프레임. 얇은 선 + 네 모서리 굵은 브래킷.
 * 선택 오버레이·녹화 영역·미리보기가 같은 모양을 쓴다. 장식이라 aria-hidden.
 */
export function CaptureFrame({
  width,
  height,
  tone = 'neutral',
  showSize,
  children,
  className,
}: CaptureFrameProps): JSX.Element {
  const style = { width, height } satisfies CSSProperties;
  return (
    <div
      className={cx('ds-frame', tone !== 'neutral' && `ds-frame--${tone}`, className)}
      style={style}
    >
      {children}
      <span className="ds-frame__line" aria-hidden="true" />
      {CORNERS.map((corner) => (
        <span key={corner} className={`ds-frame__bracket ds-frame__bracket--${corner}`} aria-hidden="true" />
      ))}
      {showSize === true ? (
        <span className="ds-frame__size tabular">
          {width} × {height}
        </span>
      ) : null}
    </div>
  );
}
