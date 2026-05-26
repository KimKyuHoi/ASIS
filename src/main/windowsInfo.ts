import { systemPreferences } from 'electron';
import koffi from 'koffi';

export type ElementBounds = { x: number; y: number; w: number; h: number; name?: string };

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

/**
 * AX 권한 fast-path 캐시 — granted 한 번 확인 후엔 systemPreferences API
 * 호출 없이 true 반환. pointermove 50ms throttle 아래서 매번 호출되던
 * systemPreferences cost 제거.
 *
 * 한계: 사용자가 시스템 설정에서 권한을 revoke 해도 다음 앱 재시작 전까지
 * 캐시가 true 로 유지된다. AX API 자체가 권한 revoke 시 axErr 를 반환하므로
 * getElementBoundsAtPoint 가 자연스럽게 null 로 fallback 한다.
 */
let _axPermGranted = false;
function checkAxPermFast(): boolean {
  if (_axPermGranted) return true;
  if (ensureAccessibilityPermission(false)) {
    _axPermGranted = true;
    return true;
  }
  return false;
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
  // CF type 판별 — batch AX 결과에 섞여 있는 kAXValueTypeIllegal AXValueRef 를
  // CFString 인 척 처리하면 NSInvalidArgumentException(_fastCStringContents:) 로
  // 프로세스가 죽으므로 type ID 비교가 필수.
  getTypeID: (ref: unknown) => number;
  stringTypeID: () => number;
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
    getTypeID: CF.func('long CFGetTypeID(CfRef)'),
    stringTypeID: CF.func('long CFStringGetTypeID()'),
  };
  return _fns;
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------
function cfStr(s: string): unknown {
  return getFns().strCreate(null, s, kCFStringEncodingUTF8);
}

/** CFStringRef 의 CFTypeID — singleton 한 번만 조회. */
let _cfStringTypeID: number | null = null;
function cfStringTypeID(): number {
  if (_cfStringTypeID === null) _cfStringTypeID = getFns().stringTypeID();
  return _cfStringTypeID;
}

function cfStrToJs(ref: unknown): string {
  if (!ref) return '';
  // type guard — CFString 이 아닌 ref (AXValueRef of kAXValueTypeIllegal 등)
  // 가 들어오면 빈 문자열 반환. 잘못된 selector 호출로 인한 native crash 방지.
  if (getFns().getTypeID(ref) !== cfStringTypeID()) return '';
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
        // 차단 대상 owner — kCGWindowBounds 가 정상적이지 않거나 자식 process.
        // - screencapture: ASIS 자신이 color picker 용 background 캡처로 spawn.
        //   PID 가 다르므로 selfPid 체크로 안 걸러짐.
        // - Dock: kCGWindowBounds 가 화면 전체(1920×1080) 로 보고되어 cursor 어디
        //   에든 hit. Opera 등 정상 윈도우가 작아도 빈 영역 클릭 시 Dock 으로 잡혀
        //   전체 화면 캡처되는 문제 발생. macOS API 한계로 우회 불가.
        if (name === 'screencapture' || name === 'Dock') continue;

        const id = cfNumToJs(f.dictGet(win, kWindowNumber));
        windows.push({ id, name, x, y, w, h });
      }

      // Retain 된 참조 해제.
      for (const k of [kBounds, kOwner, kPID, kWindowNumber, kX, kY, kW, kH]) f.release(k);
      f.release(list);

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
  // batch — 여러 attribute 를 1번의 AX IPC 로 읽음. cost 절감.
  copyMultipleAttrValues: (
    el: unknown, attrs: unknown, options: number, out: unknown[],
  ) => number;
  axValueGetValue: (
    val: unknown,
    type: number,
    out: Array<{ x: number; y: number; width: number; height: number }>,
  ) => boolean;
  // 결과 array parsing 용 — CFArrayGetValueAtIndex.
  arrayGet: (arr: unknown, idx: number) => unknown;
  // batch input array 구성용 — CFArrayCreateMutable + CFArrayAppendValue.
  arrayCreateMutable: (alloc: null, capacity: number, callbacks: null) => unknown;
  arrayAppendValue: (arr: unknown, val: unknown) => void;
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

  // AX 함수 시그니처를 CfRef 로 통일 — copyAttrValue 의 out 결과가 CFString
  // (예: AXTitle) 일 때 cfStrToJs(CfRef) 에 그대로 넘길 수 있도록.
  // AXRef·CFTypeRef·CFStringRef 모두 raw opaque pointer 이므로 명명만 통일하면 안전.
  const CF = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
  _axFns = {
    createSystemWide: AS.func('CfRef AXUIElementCreateSystemWide()'),
    elementAtPos: AS.func(
      'int32 AXUIElementCopyElementAtPosition(CfRef, float, float, _Out_ CfRef *)',
    ),
    copyAttrValue: AS.func(
      'int32 AXUIElementCopyAttributeValue(CfRef, CfRef, _Out_ CfRef *)',
    ),
    copyMultipleAttrValues: AS.func(
      'int32 AXUIElementCopyMultipleAttributeValues(CfRef, CfRef, uint32, _Out_ CfRef *)',
    ),
    axValueGetValue: AS.func(
      'AXValueGetValue',
      'bool',
      ['CfRef', 'int32', koffi.out(koffi.pointer(CGRectStruct))],
    ),
    arrayGet: CF.func('CfRef CFArrayGetValueAtIndex(CfRef, long)'),
    arrayCreateMutable: CF.func(
      'CFArrayCreateMutable', 'CfRef', ['CfRef', 'long', koffi.pointer('uint8')],
    ),
    arrayAppendValue: CF.func('void CFArrayAppendValue(CfRef, CfRef)'),
    release: AS.func('void CFRelease(CfRef)'),
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
  if (!checkAxPermFast()) return null;
  try {
    const f = getAxFns();
    const sys = f.createSystemWide();
    const elOut: unknown[] = [null];
    const axErr = f.elementAtPos(sys, screenX, screenY, elOut);
    f.release(sys);
    if (axErr !== kAXErrorSuccess || !elOut[0]) return null;

    const el = elOut[0];
    const { strCreate, release } = getFns();

    // 4개 attribute 를 1번의 AX IPC 로 batch 읽기. macOS AX IPC 비용이 koffi
    // FFI 비용보다 큰 편이라 4 → 1 호출로 의미 있는 절감.
    // 우선 순위: AXTitle(구체 라벨) → AXRoleDescription(역할명, 예: "버튼")
    //          → AXDescription(대체 설명), 마지막에 AXFrame.
    const titleKey = strCreate(null, 'AXTitle', kCFStringEncodingUTF8);
    const roleKey = strCreate(null, 'AXRoleDescription', kCFStringEncodingUTF8);
    const descKey = strCreate(null, 'AXDescription', kCFStringEncodingUTF8);
    const frameKey = strCreate(null, kAXFrameAttribute, kCFStringEncodingUTF8);
    const attrArr = f.arrayCreateMutable(null, 4, null);
    f.arrayAppendValue(attrArr, titleKey);
    f.arrayAppendValue(attrArr, roleKey);
    f.arrayAppendValue(attrArr, descKey);
    f.arrayAppendValue(attrArr, frameKey);
    const valuesOut: unknown[] = [null];
    const batchErr = f.copyMultipleAttrValues(el, attrArr, 0, valuesOut);
    // CFString 키들 + input array 정리.
    release(titleKey);
    release(roleKey);
    release(descKey);
    release(frameKey);
    release(attrArr);
    f.release(el);
    if (batchErr !== kAXErrorSuccess || !valuesOut[0]) return null;
    const values = valuesOut[0];

    // 각 attribute 의 값 추출. 실패한 attribute 는 AXValueRef of kAXValueTypeIllegal
    // 이지만 우리는 string 결과는 cfStrToJs 가 빈 문자열로, frame 결과는
    // axValueGetValue 가 false 로 자연스럽게 fail 처리한다.
    const titleVal = f.arrayGet(values, 0);
    const roleVal = f.arrayGet(values, 1);
    const descVal = f.arrayGet(values, 2);
    const frameVal = f.arrayGet(values, 3);

    let name = titleVal ? cfStrToJs(titleVal) : '';
    if (!name && roleVal) name = cfStrToJs(roleVal);
    if (!name && descVal) name = cfStrToJs(descVal);

    if (!frameVal) {
      release(values);
      return null;
    }
    const rectOut = [{ x: 0, y: 0, width: 0, height: 0 }];
    const ok = f.axValueGetValue(frameVal, kAXValueCGRectType, rectOut);
    release(values);
    if (!ok) return null;

    const { x, y, width: w, height: h } = rectOut[0];
    if (w < 2 || h < 2) return null;
    return { x, y, w, h, name: name || undefined };
  } catch (err: unknown) {
    console.warn('[asis] getElementBoundsAtPoint 실패:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Darwin notify — Space 전환 감지 (com.apple.spaces.notify)
//
// CFNotificationCenter 콜백은 Electron 의 CF run loop 통합 문제로 일부 macOS
// 버전에서 fire 가 안정적이지 않다. 대신 libSystem 의 notify_register_check +
// notify_check 폴링(150ms) 패턴을 사용 — 가볍고 신뢰성 있다.
//
// polling fallback (400ms/2500ms) 는 selectionOverlay 에서 유지 — 이 이벤트가
// 안 fire 하는 환경(특정 macOS 버전·multi-display 설정) 에서도 동작 보장.
// ---------------------------------------------------------------------------
type NotifyPollFns = {
  registerCheck: (name: string, outToken: number[]) => number;
  check: (token: number, outChanged: number[]) => number;
  cancel: (token: number) => number;
};
let _notifyFns: NotifyPollFns | null = null;
function getNotifyFns(): NotifyPollFns | null {
  if (_notifyFns) return _notifyFns;
  try {
    const lib = koffi.load('/usr/lib/libSystem.B.dylib');
    _notifyFns = {
      registerCheck: lib.func('notify_register_check', 'int', [
        'str', koffi.out(koffi.pointer('int')),
      ]),
      check: lib.func('notify_check', 'int', [
        'int', koffi.out(koffi.pointer('int')),
      ]),
      cancel: lib.func('notify_cancel', 'int', ['int']),
    };
  } catch (err) {
    console.warn('[asis] notify SPI 로드 실패 (Space 이벤트 비활성):', err);
    return null;
  }
  return _notifyFns;
}

/**
 * Space 전환 이벤트 구독. 콜백은 검출된 직후 즉시 호출된다.
 * 반환된 unsubscribe 함수로 정리.
 *
 * macOS API 또는 libSystem 로드 실패 시 no-op unsubscribe 반환 — 호출자는
 * polling fallback 으로 안전하게 동작한다.
 */
export function onSpaceChange(cb: () => void): () => void {
  const f = getNotifyFns();
  if (!f) return (): void => { /* no-op */ };
  const tokenOut = [0];
  const status = f.registerCheck('com.apple.spaces.notify', tokenOut);
  if (status !== 0) {
    console.warn(`[asis] onSpaceChange: notify_register_check 실패 status=${status}`);
    return (): void => { /* no-op */ };
  }
  const token = tokenOut[0];
  const intervalId = setInterval(() => {
    const changed = [0];
    f.check(token, changed);
    if (changed[0]) cb();
  }, 150);
  return (): void => {
    clearInterval(intervalId);
    f.cancel(token);
  };
}
