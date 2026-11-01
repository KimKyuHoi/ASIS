import koffi from 'koffi';

// ---------------------------------------------------------------------------
// Darwin notify — Space 전환 감지 (com.apple.spaces.notify)
//
// CFNotificationCenter 콜백은 Electron 의 CF run loop 통합 문제로 일부 macOS
// 버전에서 fire 가 안정적이지 않다. 대신 libSystem 의 notify_register_check +
// notify_check 폴링 패턴을 사용 — 가볍고 신뢰성 있다.
//
// polling fallback (400ms/2500ms) 는 selectionOverlay 에서 유지 — 이 이벤트가
// 안 fire 하는 환경(특정 macOS 버전·multi-display 설정) 에서도 동작 보장.
// ---------------------------------------------------------------------------

const SPACES_NOTIFY_NAME = 'com.apple.spaces.notify';
const NOTIFY_STATUS_OK = 0;
const SPACE_CHECK_INTERVAL_MS = 150;

type NotifyPollFns = {
  registerCheck: (name: string, outToken: number[]) => number;
  check: (token: number, outChanged: number[]) => number;
  cancel: (token: number) => number;
};

let notifyFns: NotifyPollFns | null = null;

function getNotifyFns(): NotifyPollFns | null {
  if (notifyFns) return notifyFns;
  try {
    const lib = koffi.load('/usr/lib/libSystem.B.dylib');
    notifyFns = {
      registerCheck: lib.func('notify_register_check', 'int', ['str', koffi.out(koffi.pointer('int'))]),
      check: lib.func('notify_check', 'int', ['int', koffi.out(koffi.pointer('int'))]),
      cancel: lib.func('notify_cancel', 'int', ['int']),
    };
  } catch (err) {
    console.warn('[asis] notify SPI 로드 실패 (Space 이벤트 비활성):', err);
    return null;
  }
  return notifyFns;
}

const noop = (): void => {
  /* no-op */
};

/**
 * Space 전환 이벤트 구독. 콜백은 검출된 직후 즉시 호출된다.
 * 반환된 unsubscribe 함수로 정리.
 *
 * libSystem 로드·등록 실패 시 no-op unsubscribe 반환 — 호출자는
 * polling fallback 으로 안전하게 동작한다.
 */
export function onSpaceChange(cb: () => void): () => void {
  const f = getNotifyFns();
  if (!f) return noop;
  const tokenOut = [0];
  const status = f.registerCheck(SPACES_NOTIFY_NAME, tokenOut);
  if (status !== NOTIFY_STATUS_OK) {
    console.warn(`[asis] onSpaceChange: notify_register_check 실패 status=${String(status)}`);
    return noop;
  }
  const token = tokenOut[0];
  const intervalId = setInterval(() => {
    const changed = [0];
    f.check(token, changed);
    if (changed[0]) cb();
  }, SPACE_CHECK_INTERVAL_MS);
  return (): void => {
    clearInterval(intervalId);
    f.cancel(token);
  };
}
