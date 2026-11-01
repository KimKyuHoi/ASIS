import { useEffect, useState } from 'react';
import type { SnapWindow } from '../types/selection';

/**
 * main → renderer visible 윈도우 목록. 권한이 없으면 빈 배열이 온다.
 * 아직 한 번도 받지 못했으면 null — invisible standby 창은 세션이 시작되기 전까지
 * 이 신호를 받지 못하므로 "세션 활성" 판정에 쓴다.
 *
 * onWindows 를 attach 한 직후 ready() 호출 — main 이 그 신호를 받은 후 windows 를
 * 전송해 레이스 없이 수신한다 (editor:ready 핸드셰이크와 동일).
 */
export function useSnapWindows(): SnapWindow[] | null {
  const [windows, setWindows] = useState<SnapWindow[] | null>(null);
  useEffect(() => {
    const off = window.selection.onWindows(setWindows);
    window.selection.ready();
    return off;
  }, []);
  return windows;
}
