import { systemPreferences } from 'electron';
import koffi from 'koffi';

export type ElementBounds = { x: number; y: number; w: number; h: number };

/**
 * macOS 의 *모든 visible 윈도우* 의 bounds 를 받아오는 모듈.
 *
 * 구현: koffi FFI + CGWindowListCopyWindowInfo (CoreGraphics).
 *   child process (osascript 등) 는 Automation / Screen Recording 권한이
 *   부모 프로세스에서 상속되지 않아 실패하므로, main process 안에서 직접 호출.
 *   main process 는 Screen Recording 권한을 가지며 window bounds 를 읽을 수 있음.
 *
 * UI 자동 감지 (Snipaste/CleanShot 시그니처): selection overlay 에서 마우스
 * hover 시 윈도우 윤곽 자동 표시 + 클릭 한 번으로 그 영역 선택.
 */

export type WindowInfo = {
  id: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function ensureAccessibilityPermission(prompt: boolean): boolean {
  return systemPreferences.isTrustedAccessibilityClient(prompt);
}

// ---------------------------------------------------------------------------
// CoreFoundation / CoreGraphics 상수
// ---------------------------------------------------------------------------
const kCFStringEncodingUTF8 = 0x08000100;
const kCFNumberDoubleType = 13;      // double (64-bit)
const kCGWindowListOptionOnScreenOnly = 1;      // 1 << 0
const kCGWindowListExcludeDesktopElements = 16; // 1 << 4

// ---------------------------------------------------------------------------
// lazy-init koffi bindings — koffi.load 는 dlopen, 한 번만.
// ---------------------------------------------------------------------------
type Fns = {
  winList: (opts: number, rel: number) => unknown;
  arrCount: (arr: unknown) => number;
  arrGet: (arr: unknown, idx: number) => unknown;
  dictGet: (dict: unknown, key: unknown) => unknown;
  strCreate: (alloc: null, s: string, enc: number) => unknown;
  strPtr: (s: unknown, enc: number) => string | null;
  strGetCString: (s: unknown, buf: Buffer, maxLen: number, enc: number) => boolean;
  numVal: (num: unknown, type: number, out: number[]) => boolean;
  release: (ref: unknown) => void;
};

// ---------------------------------------------------------------------------
// koffi 타입 객체 — process(globalThis) 레벨 캐시
//
// koffi 타입 레지스트리는 프로세스 전체에서 공유되며 hot-reload 후에도 유지된다.
// 반면 모듈 변수는 hot-reload 시 재초기화된다. 타입 객체를 globalThis 에 저장하면
// 동일한 명명 타입을 항상 재사용할 수 있어 "Duplicate type name" 오류를 방지한다.
// ---------------------------------------------------------------------------
const _g = globalThis as typeof globalThis & {
  __asisKoffiCfRef: ReturnType<typeof koffi.pointer> | undefined;
  __asisKoffiAXRef: ReturnType<typeof koffi.pointer> | undefined;
  __asisKoffiCGRect: ReturnType<typeof koffi.struct> | undefined;
};

function getCfRef(): ReturnType<typeof koffi.pointer> {
  if (_g.__asisKoffiCfRef) return _g.__asisKoffiCfRef;
  try {
    _g.__asisKoffiCfRef = koffi.pointer('CfRef', koffi.opaque());
  } catch {
    // hot-reload: 이미 등록된 이름 — 이름 문자열로 참조하므로 anonymous fallback 불필요.
    // globalThis 에 null-ish 이므로 다음 getFns() 호출에서 다시 시도되지 않도록 dummy 값 저장.
    _g.__asisKoffiCfRef = koffi.pointer(koffi.opaque());
  }
  return _g.__asisKoffiCfRef;
}

function getAXRef(): ReturnType<typeof koffi.pointer> {
  if (_g.__asisKoffiAXRef) return _g.__asisKoffiAXRef;
  try {
    _g.__asisKoffiAXRef = koffi.pointer('AXRef', koffi.opaque());
  } catch {
    _g.__asisKoffiAXRef = koffi.pointer(koffi.opaque());
  }
  return _g.__asisKoffiAXRef;
}

function getCGRectStruct(): ReturnType<typeof koffi.struct> {
  if (_g.__asisKoffiCGRect) return _g.__asisKoffiCGRect;
  try {
    _g.__asisKoffiCGRect = koffi.struct('CGRect_t', {
      x: 'double', y: 'double', width: 'double', height: 'double',
    });
  } catch {
    _g.__asisKoffiCGRect = koffi.struct({ x: 'double', y: 'double', width: 'double', height: 'double' });
  }
  return _g.__asisKoffiCGRect;
}

let _fns: Fns | null = null;

function getFns(): Fns {
  if (_fns) return _fns;

  // getCfRef/getAXRef 를 먼저 호출해 타입이 레지스트리에 등록되도록 한다.
  getCfRef();

  const CF = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
  const CG = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
  _fns = {
    winList: CG.func('CfRef CGWindowListCopyWindowInfo(uint32, uint32)'),
    arrCount: CF.func('long CFArrayGetCount(CfRef)'),
    arrGet: CF.func('CfRef CFArrayGetValueAtIndex(CfRef, long)'),
    dictGet: CF.func('CfRef CFDictionaryGetValue(CfRef, CfRef)'),
    strCreate: CF.func('CfRef CFStringCreateWithCString(CfRef, str, uint32)'),
    strPtr: CF.func('str CFStringGetCStringPtr(CfRef, uint32)'),
    strGetCString: CF.func('bool CFStringGetCString(CfRef, char *, long, uint32)'),
    // 문자열 타입명으로 선언 — hot-reload 후 anonymous fallback 타입과의 불일치 방지.
    numVal: CF.func('CFNumberGetValue', 'bool', ['CfRef', 'int', koffi.out(koffi.pointer('double'))]),
    release: CF.func('void CFRelease(CfRef)'),
  };
  return _fns;
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------
function cfStr(s: string): unknown {
  return getFns().strCreate(null, s, kCFStringEncodingUTF8);
}

function cfStrToJs(ref: unknown): string {
  if (!ref) return '';
  // 빠른 경로: 8-bit 저장 CFString 은 포인터 직접 반환.
  const ptr = getFns().strPtr(ref, kCFStringEncodingUTF8);
  if (typeof ptr === 'string') return ptr;
  // 폴백: UTF-16 저장 CFString (대부분의 앱 이름) — 버퍼로 복사.
  const buf = Buffer.alloc(256);
  const ok = getFns().strGetCString(ref, buf, buf.length, kCFStringEncodingUTF8);
  if (!ok) return '';
  const nul = buf.indexOf(0);
  return buf.subarray(0, nul < 0 ? buf.length : nul).toString('utf8');
}

function cfNumToJs(ref: unknown): number {
  if (!ref) return 0;
  const out = [0.0];
  getFns().numVal(ref, kCFNumberDoubleType, out);
  return out[0];
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------
/**
 * 모든 visible 윈도우의 position + size 를 list 로 반환.
 * koffi 초기화·호출 실패 시 빈 배열 — overlay 는 수동 선택만으로 동작.
 */
export function listWindows(): Promise<WindowInfo[]> {
  return new Promise((resolve) => {
    try {
      const f = getFns();
      const list = f.winList(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        0,
      );
      if (!list) {
        resolve([]);
        return;
      }

      const count = f.arrCount(list);

      // 루프 안 반복 생성 방지 — CFString 키를 미리 만들어 둠.
      const kBounds = cfStr('kCGWindowBounds');
      const kOwner = cfStr('kCGWindowOwnerName');
      const kPID = cfStr('kCGWindowOwnerPID');
      const kWindowNumber = cfStr('kCGWindowNumber');
      const kX = cfStr('X');
      const kY = cfStr('Y');
      const kW = cfStr('Width');
      const kH = cfStr('Height');

      const selfPid = process.pid;
      const windows: WindowInfo[] = [];

      for (let i = 0; i < count; i++) {
        const win = f.arrGet(list, i);
        if (!win) continue;

        const pid = cfNumToJs(f.dictGet(win, kPID));
        if (pid === selfPid) continue;

        const boundsRef = f.dictGet(win, kBounds);
        if (!boundsRef) continue;
        const x = cfNumToJs(f.dictGet(boundsRef, kX));
        const y = cfNumToJs(f.dictGet(boundsRef, kY));
        const w = cfNumToJs(f.dictGet(boundsRef, kW));
        const h = cfNumToJs(f.dictGet(boundsRef, kH));

        if (w < 2 || h < 2) continue;

        const name = cfStrToJs(f.dictGet(win, kOwner));
        // owner name 이 빈 윈도우 = macOS 내부 레이어 (Desktop 배경, 알림센터 등).
        if (!name) continue;

        const id = cfNumToJs(f.dictGet(win, kWindowNumber));
        windows.push({ id, name, x, y, w, h });
      }

      // Retain 된 참조 해제.
      for (const k of [kBounds, kOwner, kPID, kWindowNumber, kX, kY, kW, kH]) f.release(k);
      f.release(list);

      console.info(`[asis] listWindows: CGWindowList total=${count}, filtered=${windows.length}`, windows.slice(0, 3).map((w) => `${w.name}(${w.x},${w.y},${w.w}x${w.h})`));
      resolve(windows);
    } catch (err: unknown) {
      console.warn('[asis] listWindows koffi 실패:', err);
      resolve([]);
    }
  });
}

// ---------------------------------------------------------------------------
// AXUIElement — 마우스 위치의 개별 UI 요소 bounds 조회
// ---------------------------------------------------------------------------

type AXFns = {
  createSystemWide: () => unknown;
  elementAtPos: (sys: unknown, x: number, y: number, out: unknown[]) => number;
  copyAttrValue: (el: unknown, attr: unknown, out: unknown[]) => number;
  axValueGetValue: (
    val: unknown,
    type: number,
    out: Array<{ x: number; y: number; width: number; height: number }>,
  ) => boolean;
  release: (ref: unknown) => void;
};

let _axFns: AXFns | null = null;

function getAxFns(): AXFns {
  if (_axFns) return _axFns;

  getCfRef(); // 'CfRef' 이름이 레지스트리에 있어야 copyAttrValue 시그니처 파싱 가능.
  getAXRef(); // 'AXRef' 이름 등록.
  const CGRectStruct = getCGRectStruct();

  const AS = koffi.load(
    '/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices',
  );

  _axFns = {
    createSystemWide: AS.func('AXRef AXUIElementCreateSystemWide()'),
    // AXError(int32) 반환 — 0 이면 success.
    elementAtPos: AS.func('int32 AXUIElementCopyElementAtPosition(AXRef, float, float, _Out_ AXRef *)'),
    // C 원형: AXUIElementCopyAttributeValue(AXUIElementRef, CFStringRef, CFTypeRef*)
    // 2번째 파라미터가 CFStringRef = CfRef 이므로 AXRef 가 아님.
    copyAttrValue: AS.func('int32 AXUIElementCopyAttributeValue(AXRef, CfRef, _Out_ AXRef *)'),
    // koffi 3-arg: func(name, returnType, params) — AXRef 문자열명 사용으로 hot-reload 불일치 방지.
    axValueGetValue: AS.func(
      'AXValueGetValue',
      'bool',
      ['AXRef', 'int32', koffi.out(koffi.pointer(CGRectStruct))],
    ),
    release: AS.func('void CFRelease(AXRef)'),
  };
  return _axFns;
}

const kAXErrorSuccess = 0;
const kAXFrameAttribute = 'AXFrame';
const kAXValueCGRectType = 3;

/**
 * 주어진 macOS 스크린 좌표(논리 픽셀)에서 가장 구체적인 AXUIElement 의 frame 반환.
 * 손쉬운 사용 권한이 없거나 실패하면 null.
 */
export function getElementBoundsAtPoint(
  screenX: number,
  screenY: number,
): ElementBounds | null {
  if (!ensureAccessibilityPermission(false)) return null;
  try {
    const f = getAxFns();
    const sys = f.createSystemWide();
    const elOut: unknown[] = [null];
    const axErr = f.elementAtPos(sys, screenX, screenY, elOut);
    f.release(sys);
    if (axErr !== kAXErrorSuccess || !elOut[0]) return null;

    const el = elOut[0];
    // kAXFrameAttribute 문자열을 CFString 으로 변환.
    const { strCreate, release } = getFns();
    const attrKey = strCreate(null, kAXFrameAttribute, kCFStringEncodingUTF8);
    const valOut: unknown[] = [null];
    const attrErr = f.copyAttrValue(el, attrKey, valOut);
    release(attrKey);
    f.release(el);
    if (attrErr !== kAXErrorSuccess || !valOut[0]) return null;

    const axVal = valOut[0];
    const rectOut = [{ x: 0, y: 0, width: 0, height: 0 }];
    const ok = f.axValueGetValue(axVal, kAXValueCGRectType, rectOut);
    f.release(axVal);
    if (!ok) return null;

    const { x, y, width: w, height: h } = rectOut[0];
    if (w < 2 || h < 2) return null;
    return { x, y, w, h };
  } catch (err: unknown) {
    console.warn('[asis] getElementBoundsAtPoint 실패:', err);
    return null;
  }
}
