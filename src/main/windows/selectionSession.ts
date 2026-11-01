import type { BrowserWindow } from 'electron';
import type { DisplayRef } from './overlayWindow';

/**
 * 영역 선택 세션의 자료형·순수 함수 — selectionOverlay.ts 에서 분리 (max-lines).
 *
 * 룰
 *   - imperative-style.md — 모듈 함수·Class 내부 명령형 OK.
 *   - null-safety.md — 연결 전 cancel 호출은 버그로 보고 throw.
 */

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  windowId?: number;
};

/** 모니터 하나를 덮는 오버레이 창. ready = renderer 가 capture:ready 를 보냈는지. */
export type Overlay = { win: BrowserWindow; display: DisplayRef; ready: boolean };

/** 선택 세션 하나 — 모든 모니터 창이 한 번의 선택/취소로 같이 끝난다. */
export class Session {
  /** [0] 은 커서 모니터의 기준 창. 다른 모니터 창은 뒤에 추가된다. */
  readonly overlays: Overlay[];
  readonly unsubscribes: (() => void)[] = [];
  private isSettled = false;
  private onCancel: (() => void) | null = null;

  constructor(primary: Overlay) {
    this.overlays = [primary];
  }

  get settled(): boolean {
    return this.isSettled;
  }

  /** 처음 한 번만 true — 이후 호출은 false (settle 중복 방지). */
  markSettled(): boolean {
    if (this.isSettled) return false;
    this.isSettled = true;
    return true;
  }

  bindCancel(cancel: () => void): void {
    this.onCancel = cancel;
  }

  cancel(): void {
    if (!this.onCancel) throw new Error('selectionOverlay: cancel 이 연결되기 전에 호출됨');
    this.onCancel();
  }
}

/**
 * 일반 드래그 rect 를 sender 모니터 안으로 자른다 (로컬 좌표). 윈도우 스냅(windowId)은
 * 창 실제 bounds 라 자르지 않는다. 잘라서 면적이 0 이면 null.
 */
export function clampToDisplay(rect: Rect, bounds: DisplayRef['bounds']): Rect | null {
  const left = Math.max(0, Math.min(rect.x, bounds.width));
  const top = Math.max(0, Math.min(rect.y, bounds.height));
  const right = Math.max(left, Math.min(rect.x + rect.w, bounds.width));
  const bottom = Math.max(top, Math.min(rect.y + rect.h, bounds.height));
  if (right - left <= 0 || bottom - top <= 0) return null;
  return { ...rect, x: left, y: top, w: right - left, h: bottom - top };
}
