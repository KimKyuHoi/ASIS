import { useEffect, useState } from 'react';
import { paintBackground } from '../lib/paint-background';

type BackgroundCanvas = {
  /** hidden <canvas> 의 ref 콜백. */
  setCanvas: (canvas: HTMLCanvasElement | null) => void;
  canvas: HTMLCanvasElement | null;
  /** 첫 스냅샷이 도착했는지 — 그리기 실패와 무관하게 세션 활성 신호로 쓴다. */
  received: boolean;
  /** 스냅샷을 다 그려서 magnifier 픽셀 source 로 쓸 수 있는지. */
  ready: boolean;
};

/**
 * main → renderer background 스냅샷을 hidden canvas 에 그린다.
 * raw(BGRA) 는 디코딩 없이 즉시, dataURL 폴백은 createImageBitmap 오프스레드
 * 디코딩 — 어느 쪽도 RAF 대기 없이 도착 즉시 그린다 (paint-background.ts).
 *
 * canvas 크기는 paintBackground 가 명령형으로 관리한다. width/height 를 JSX prop
 * 으로 두면 재렌더가 canvas 를 리셋해 그린 픽셀이 지워진다.
 */
export function useBackgroundCanvas(logLabel: string): BackgroundCanvas {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [received, setReceived] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canvas) return undefined;
    let stale = false;
    const off = window.selection.onBackground((payload) => {
      setReceived(true);
      paintBackground(canvas, payload)
        .then(() => {
          if (!stale) setReady(true);
        })
        .catch((err: unknown) => {
          // background 실패 시 magnifier 만 비활성 — 선택·측정 UX 는 계속 동작한다.
          console.warn(`[asis ${logLabel}] background 그리기 실패:`, err);
        });
    });
    return () => {
      stale = true;
      off();
    };
  }, [canvas, logLabel]);

  return { setCanvas, canvas, received, ready };
}
