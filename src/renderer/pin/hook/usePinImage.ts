import { useEffect, useState } from 'react';
import type { PinViewAction } from '../types/pin-view';

export type PinImage = { src: string; width: number; height: number };

/**
 * main → renderer 핀 이미지 수신. 첫 payload 의 기본 투명도는 보기 상태로 dispatch 한다.
 * dispatch 는 useReducer 의 안정 참조여야 한다 — 바뀌면 구독과 ready handshake 가 다시 돈다.
 * 이미지가 오기 전에는 null.
 */
export function usePinImage(dispatch: (action: PinViewAction) => void): PinImage | null {
  const [image, setImage] = useState<PinImage | null>(null);

  useEffect(() => {
    // IPC 구독 — teardown 에서 리스너 해제 (Strict Mode 이중 마운트 시 중복 등록 방지).
    const offLoadImage = window.pin.onLoadImage(({ src, width, height, opacity }) => {
      setImage({ src, width, height });
      dispatch({ type: 'set-opacity', opacity });
    });
    window.pin.ready();
    return offLoadImage;
  }, [dispatch]);

  return image;
}
