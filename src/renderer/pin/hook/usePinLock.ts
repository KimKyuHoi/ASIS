import { useEffect, useReducer, useRef } from 'react';
import type { PinLockState } from '../types/pin-view';

type LockAction =
  | { type: 'changed'; enabled: boolean; releaseHotkey: string } |
  { type: 'dismiss-toast' };

const INITIAL_LOCK: PinLockState = { clickThrough: false, releaseHotkey: '', toast: null };

function lockReducer(state: PinLockState, action: LockAction): PinLockState {
  if (action.type === 'dismiss-toast') return { ...state, toast: null };
  // main 은 같은 상태를 다시 알릴 수 있다(토글 echo). 실제로 바뀐 경우에만 토스트.
  // 토스트가 없으면(null) 새 토스트는 어차피 새로 마운트되므로 id 는 1 부터 다시 센다.
  const toast =
    action.enabled === state.clickThrough
      ? state.toast
      : { id: (state.toast?.id ?? 0) + 1, locked: action.enabled };
  return { clickThrough: action.enabled, releaseHotkey: action.releaseHotkey, toast };
}

/**
 * click-through(고정) 상태. 단일 원천은 main — 트레이·전역 단축키 일괄 해제도
 * 같은 채널로 들어오므로 화면 표시가 실제 상태와 어긋나지 않는다.
 */
export function usePinLock(): PinLockState & {
  toggle: () => void;
  dismissToast: () => void;
} {
  const [state, dispatch] = useReducer(lockReducer, INITIAL_LOCK);
  // 아직 main 이 답하지 않은 요청들. 답이 오기 전 X 를 연타해도 요청이 번갈아 나가도록
  // 렌더 시점 state 대신 마지막 요청값(last)을 기준으로 반전한다.
  // main 은 setClickThrough 요청마다 정확히 한 번 답하므로 개수(count)로 짝을 맞추고,
  // 마지막 답이 와야 last 를 버린다. 트레이 일괄 해제처럼 요청 없이 오는 알림은 개수를
  // 하나 더 깎을 수 있지만 0 아래로는 안 내려가 렌더 state 기준으로 돌아갈 뿐 막히지 않는다.
  const pendingRef = useRef<{ count: number; last: boolean }>({ count: 0, last: false });

  useEffect(() => {
    return window.pin.onClickThroughChanged(({ enabled, releaseHotkey }) => {
      pendingRef.current.count = Math.max(0, pendingRef.current.count - 1);
      dispatch({ type: 'changed', enabled, releaseHotkey });
    });
  }, []);

  const toggle = (): void => {
    const pending = pendingRef.current;
    const current = pending.count > 0 ? pending.last : state.clickThrough;
    pending.count += 1;
    pending.last = !current;
    // 요청만 보낸다 — 결과는 onClickThroughChanged 로 돌아온다.
    window.pin.setClickThrough(!current);
  };

  return {
    ...state,
    toggle,
    dismissToast: (): void => dispatch({ type: 'dismiss-toast' }),
  };
}
