import { useEffect } from 'react';
import type { PinView } from '../types/pin-view';
import type { PinImage } from './usePinImage';
import { contentSize } from '../lib/pin-view';

/** 줌·회전 변경 시 윈도우 크기 갱신 — 콘텐츠가 정확히 들어가도록. */
export function usePinWindowSize(image: PinImage | null, view: PinView): void {
  const { zoom, rotation } = view;
  useEffect(() => {
    // 첫 이미지 수신 전에는 맞출 크기가 없다.
    if (!image) return;
    const size = contentSize(image, { zoom, rotation });
    window.pin.setSize(size.width, size.height);
  }, [image, zoom, rotation]);
}

