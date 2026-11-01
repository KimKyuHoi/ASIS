import koffi from 'koffi';

/**
 * 자동 스크롤용 CoreGraphics 이벤트 주입 — koffi FFI.
 *
 * 시그니처 출처: macOS SDK CoreGraphics 헤더
 *   - CGEvent.h        CGEventCreateScrollWheelEvent2 / CGEventPost / CGEventSetLocation /
 *                      CGEventGetLocation / CGEventCreate / CGPreflightPostEventAccess
 *   - CGEventTypes.h   kCGScrollEventUnitPixel = 0, kCGHIDEventTap = 0
 *   - CGRemoteOperation.h  CGWarpMouseCursorPosition(CGPoint) — 이벤트 없이 커서 이동
 *
 * 스크롤 휠 이벤트는 커서 아래 창으로 가므로 이벤트 위치를 캡처 영역 중앙으로 지정하고 커서도
 * 그 자리로 옮긴다(Safari·Electron 창 실측). 휠 부호는 실측상 음수 = 아래로 스크롤.
 * 다른 앱에 이벤트를 보내려면 손쉬운 사용 신뢰가 필요하다 — 없으면 CGEventPost 는 조용히 버린다.
 *
 * 룰: side-effects.md — lifecycle 없는 FFI 호출 → 모듈 함수. null-safety.md — NULL 명시 throw.
 */

type Point = { x: number; y: number };

type Fns = {
  createScroll: koffi.KoffiFunction;
  create: koffi.KoffiFunction;
  getLocation: koffi.KoffiFunction;
  setLocation: koffi.KoffiFunction;
  post: koffi.KoffiFunction;
  warp: koffi.KoffiFunction;
  preflight: koffi.KoffiFunction;
  release: koffi.KoffiFunction;
};

let fns: Fns | null = null;

function getFns(): Fns {
  if (fns) return fns;
  // 명명 타입은 프로세스 전역이라 hot-reload 때 "Duplicate type name" — anonymous 로 둔다.
  const ref = koffi.pointer(koffi.opaque());
  const point = koffi.struct({ x: 'double', y: 'double' });
  const CG = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
  const CF = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
  fns = {
    createScroll: CG.func('CGEventCreateScrollWheelEvent2', ref, [
      ref, 'uint32', 'uint32', 'int32', 'int32', 'int32',
    ]),
    create: CG.func('CGEventCreate', ref, [ref]),
    getLocation: CG.func('CGEventGetLocation', point, [ref]),
    setLocation: CG.func('CGEventSetLocation', 'void', [ref, point]),
    post: CG.func('CGEventPost', 'void', ['uint32', ref]),
    warp: CG.func('CGWarpMouseCursorPosition', 'int32', [point]),
    preflight: CG.func('CGPreflightPostEventAccess', 'bool', []),
    release: CF.func('CFRelease', 'void', [ref]),
  };
  return fns;
}

const kCGScrollEventUnitPixel = 0;
const kCGHIDEventTap = 0;
/** Apple 헤더: 휠 값은 작은 정수를 기대 — 픽셀 단위도 한 이벤트에 이 이하로 나눠 보낸다. */
const MAX_PIXELS_PER_EVENT = 40;
/** 나눠 보내는 이벤트 사이 간격(ms) — 앱이 이벤트를 합치거나 버리지 않게. */
const EVENT_GAP_MS = 8;

/** 다른 앱으로 이벤트를 보낼 수 있는지(손쉬운 사용 신뢰). 묻지 않는다. */
export function canPostEvents(): boolean {
  return getFns().preflight() as boolean;
}

/** 현재 커서 위치(전역 좌표, 좌상단 원점 — CGEvent 좌표계). */
export function getCursorPosition(): Point {
  const f = getFns();
  const ev: unknown = f.create(null);
  if (!ev) throw new Error('CGEventCreate 가 NULL 을 반환');
  try {
    const p = f.getLocation(ev) as Point;
    return { x: p.x, y: p.y };
  } finally {
    f.release(ev);
  }
}

export function warpCursor(p: Point): void {
  const err = getFns().warp(p) as number;
  if (err !== 0) throw new Error(`CGWarpMouseCursorPosition 실패 (CGError ${String(err)})`);
}

/**
 * at 위치에 세로 스크롤 이벤트를 픽셀 단위로 나눠 보낸다.
 * @param pixels 양수 = 휠을 위로(콘텐츠가 아래로) — CG 휠 부호 그대로. 호출측이 방향을 정한다.
 * @param isActive 덩어리마다 확인 — 정지·취소 뒤에 남은 휠 이벤트가 나가 커서 아래의 다른 창을
 *   스크롤하지 않게 한다.
 */
export async function postScroll(
  at: Point,
  pixels: number,
  isActive: () => boolean,
): Promise<void> {
  const left = Math.round(pixels);
  if (left === 0 || !isActive()) return;
  const step = Math.sign(left) * Math.min(MAX_PIXELS_PER_EVENT, Math.abs(left));
  postScrollEvent(at, step);
  if (left === step) return;
  await new Promise((resolve) => setTimeout(resolve, EVENT_GAP_MS));
  await postScroll(at, left - step, isActive);
}

function postScrollEvent(at: Point, pixels: number): void {
  const f = getFns();
  const ev: unknown = f.createScroll(null, kCGScrollEventUnitPixel, 1, pixels, 0, 0);
  if (!ev) throw new Error('CGEventCreateScrollWheelEvent2 가 NULL 을 반환');
  try {
    f.setLocation(ev, at);
    f.post(kCGHIDEventTap, ev);
  } finally {
    f.release(ev);
  }
}
