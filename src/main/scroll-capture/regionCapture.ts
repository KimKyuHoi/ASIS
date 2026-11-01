import { screen } from 'electron';
import log from 'electron-log/main';
import koffi from 'koffi';
import type { Frame } from './rowProfile';

/**
 * 화면 영역 in-process 캡처 — CGDisplayCreateImageForRect (koffi FFI).
 *
 * screencapture spawn 은 한 장에 ~115ms(실측) 라 빠른 스크롤에서 프레임 사이 겹침이 사라진다.
 * in-process 캡처는 ~17ms(실측, 2200×1376px) — 같은 시간에 6배 이상 찍을 수 있다.
 * macOS 15 에서 obsolete 표시된 API 지만 macOS 26(Darwin 25) 에서 동작을 확인했다(크기·포맷
 * 일치, screencapture 결과와 같은 화면). NULL·예상 밖 포맷이면 null — 호출측이 screencapture 로 폴백.
 *
 * 시그니처 출처: macOS SDK CGDirectDisplay.h — CGImageRef CGDisplayCreateImageForRect(
 *   CGDirectDisplayID display, CGRect rect), rect 는 "display space".
 *
 * 룰: side-effects.md — lifecycle 없는 FFI 호출 → 모듈 함수(displaySnapshot 과 같은 결).
 */

export type Rect = { x: number; y: number; w: number; h: number };

type Fns = {
  createForRect: koffi.KoffiFunction;
  width: koffi.KoffiFunction;
  height: koffi.KoffiFunction;
  bytesPerRow: koffi.KoffiFunction;
  bitmapInfo: koffi.KoffiFunction;
  dataProvider: koffi.KoffiFunction;
  copyData: koffi.KoffiFunction;
  dataLength: koffi.KoffiFunction;
  dataPtr: koffi.KoffiFunction;
  release: koffi.KoffiFunction;
};

/** undefined = 미시도, null = 바인딩 실패(이후 폴백 고정). */
let fns: Fns | null | undefined;

function getFns(): Fns | null {
  if (fns !== undefined) return fns;
  try {
    // 명명 타입은 프로세스 전역이라 hot-reload 때 "Duplicate type name" — anonymous 로 둔다.
    const ref = koffi.pointer(koffi.opaque());
    const cgRect = koffi.struct({ x: 'double', y: 'double', w: 'double', h: 'double' });
    const CG = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
    const CF = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
    fns = {
      createForRect: CG.func('CGDisplayCreateImageForRect', ref, ['uint32', cgRect]),
      width: CG.func('CGImageGetWidth', 'ulong', [ref]),
      height: CG.func('CGImageGetHeight', 'ulong', [ref]),
      bytesPerRow: CG.func('CGImageGetBytesPerRow', 'ulong', [ref]),
      bitmapInfo: CG.func('CGImageGetBitmapInfo', 'uint32', [ref]),
      dataProvider: CG.func('CGImageGetDataProvider', ref, [ref]),
      copyData: CG.func('CGDataProviderCopyData', ref, [ref]),
      dataLength: CF.func('CFDataGetLength', 'long', [ref]),
      dataPtr: CF.func('CFDataGetBytePtr', koffi.pointer('uint8'), [ref]),
      release: CF.func('CFRelease', 'void', [ref]),
    };
  } catch (err) {
    log.warn('[scroll] CoreGraphics 바인딩 실패 — screencapture 사용', err);
    fns = null;
  }
  return fns;
}

// nativeImage.toBitmap() 과 같은 BGRA(32Little + alpha first) 만 받는다 — 프로필 계산이 채널
// 순서에 민감하진 않지만, 합성 PNG 의 색이 뒤바뀌지 않게.
const kByteOrderMask = 0x7000;
const kByteOrder32Little = 0x2000;
const kAlphaMask = 0x1f;
const kPremultipliedFirst = 2;
const kNoneSkipFirst = 6;

function isBgra(info: number): boolean {
  const alpha = info & kAlphaMask;
  return (info & kByteOrderMask) === kByteOrder32Little &&
    (alpha === kPremultipliedFirst || alpha === kNoneSkipFirst);
}

/**
 * 전역 논리 좌표 rect 를 캡처. 실패(바인딩·NULL·포맷) 는 null.
 * rect 를 담은 디스플레이 기준 좌표로 바꿔 넘긴다("display space").
 */
export async function captureRegion(rect: Rect): Promise<Frame | null> {
  const f = getFns();
  if (!f) return null;
  const display = screen.getDisplayMatching({
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
  });
  const { bounds } = display;
  const inside =
    rect.x >= bounds.x && rect.y >= bounds.y &&
    rect.x + rect.w <= bounds.x + bounds.width && rect.y + rect.h <= bounds.y + bounds.height;
  // 두 디스플레이에 걸친 영역은 한 디스플레이 API 로 다 못 찍는다 — 처음부터 screencapture 로.
  // (첫 장에서 null 이면 FrameSource 가 이후 전부 screencapture 로 고정 → 프레임 크기 일정.)
  if (!inside) return null;
  const local = { x: rect.x - bounds.x, y: rect.y - bounds.y, w: rect.w, h: rect.h };
  const img = await new Promise<unknown>((resolve, reject) => {
    f.createForRect.async(display.id, local, (err: unknown, res: unknown) => {
      if (err instanceof Error) reject(err);
      else if (err) reject(new Error('CGDisplayCreateImageForRect 비동기 호출 실패'));
      else resolve(res);
    });
  });
  // NULL = 권한 없음, 디스플레이 sleep, 미래 macOS 의 API 제거 등 — 폴백 경로.
  if (!img) return null;
  try {
    return readImage(f, img);
  } finally {
    f.release(img);
  }
}

function readImage(f: Fns, img: unknown): Frame | null {
  const width = Number(f.width(img));
  const height = Number(f.height(img));
  const stride = Number(f.bytesPerRow(img));
  if (width <= 0 || height <= 0 || !isBgra(Number(f.bitmapInfo(img)))) return null;
  const data: unknown = f.copyData(f.dataProvider(img));
  if (!data) return null;
  try {
    const len = Number(f.dataLength(data));
    const src = Buffer.from(koffi.decode(f.dataPtr(data), koffi.array('uint8', len)) as Uint8Array);
    const rowBytes = width * 4;
    if (stride === rowBytes) return { width, height, buf: src };
    // stride 패딩 제거 — 프로필·합성은 촘촘한 행을 기대한다.
    const buf = Buffer.allocUnsafe(rowBytes * height);
    for (let y = 0; y < height; y++) src.copy(buf, y * rowBytes, y * stride, y * stride + rowBytes);
    return { width, height, buf };
  } finally {
    f.release(data);
  }
}
