import koffi from 'koffi';

/**
 * CoreFoundation / CoreGraphics koffi 바인딩과 CF → JS 변환 헬퍼.
 * windowsInfo(CGWindowList) 와 accessibility(AXUIElement) 가 함께 쓴다.
 */

const CORE_FOUNDATION_PATH = '/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation';
const CORE_GRAPHICS_PATH = '/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics';

const kCFStringEncodingUTF8 = 0x08000100;
const kCFNumberDoubleType = 13; // double (64-bit)
/** UTF-16 저장 CFString 을 복사할 때 쓰는 버퍼 크기 — 앱 이름·AX 라벨 길이 기준. */
const CF_STRING_COPY_BUFFER_BYTES = 256;

// FFI 시그니처는 네이티브 함수의 인자 수를 그대로 따른다. 인자 수를 줄일 수 없으므로
// 3개를 넘는 함수는 rest tuple 로 선언한다.
type CfFns = {
  winList: (opts: number, rel: number) => unknown;
  arrCount: (arr: unknown) => number;
  arrGet: (arr: unknown, idx: number) => unknown;
  dictGet: (dict: unknown, key: unknown) => unknown;
  strCreate: (alloc: null, s: string, enc: number) => unknown;
  strPtr: (s: unknown, enc: number) => string | null;
  strGetCString: (...args: [s: unknown, buf: Buffer, maxLen: number, enc: number]) => boolean;
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
type KoffiType = koffi.IKoffiCType;

const typeCache = globalThis as typeof globalThis & {
  __asisKoffiTypes: Map<string, KoffiType> | undefined;
};

/**
 * 이름 붙은 koffi 타입을 한 번만 등록한다. 이미 레지스트리에 같은 이름이 있으면
 * (hot-reload) 이름 문자열로 참조되므로 anonymous 타입을 캐시에 넣어 재시도를 막는다.
 */
function registerNamedType(
  name: string,
  create: { named: () => KoffiType; anonymous: () => KoffiType },
): KoffiType {
  typeCache.__asisKoffiTypes ??= new Map();
  const cached = typeCache.__asisKoffiTypes.get(name);
  if (cached) return cached;
  let type: KoffiType;
  try {
    type = create.named();
  } catch {
    // hot-reload: 같은 이름이 이미 등록됨 — 시그니처는 이름 문자열로 그 타입을 찾는다.
    type = create.anonymous();
  }
  typeCache.__asisKoffiTypes.set(name, type);
  return type;
}

/** 'CfRef' 를 레지스트리에 등록한다. CF/AX 시그니처 문자열 파싱 전에 호출돼야 한다. */
export function registerCfRefType(): void {
  registerNamedType('CfRef', {
    named: () => koffi.pointer('CfRef', koffi.opaque()),
    anonymous: () => koffi.pointer(koffi.opaque()),
  });
}

/** 'AXRef' 를 레지스트리에 등록한다. */
export function registerAxRefType(): void {
  registerNamedType('AXRef', {
    named: () => koffi.pointer('AXRef', koffi.opaque()),
    anonymous: () => koffi.pointer(koffi.opaque()),
  });
}

const CG_RECT_FIELDS = { x: 'double', y: 'double', width: 'double', height: 'double' };

export function getCGRectStruct(): KoffiType {
  return registerNamedType('CGRect_t', {
    named: () => koffi.struct('CGRect_t', CG_RECT_FIELDS),
    anonymous: () => koffi.struct(CG_RECT_FIELDS),
  });
}

export function loadCoreFoundation(): koffi.IKoffiLib {
  return koffi.load(CORE_FOUNDATION_PATH);
}

let cfFns: CfFns | null = null;

/** lazy-init — koffi.load 는 dlopen 이라 한 번만 한다. */
export function getCfFns(): CfFns {
  if (cfFns) return cfFns;
  registerCfRefType();
  const CF = loadCoreFoundation();
  const CG = koffi.load(CORE_GRAPHICS_PATH);
  cfFns = {
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
  return cfFns;
}

// ---------------------------------------------------------------------------
// CF ↔ JS 변환
// ---------------------------------------------------------------------------

/** 호출자가 cfRelease 로 해제해야 하는 CFString 을 만든다. */
export function cfStr(s: string): unknown {
  return getCfFns().strCreate(null, s, kCFStringEncodingUTF8);
}

export function cfRelease(...refs: unknown[]): void {
  const { release } = getCfFns();
  for (const ref of refs) release(ref);
}

let stringTypeId: number | null = null;

/** CFStringRef 의 CFTypeID — 한 번만 조회한다. */
function cfStringTypeId(): number {
  stringTypeId ??= getCfFns().stringTypeID();
  return stringTypeId;
}

/**
 * CFString → JS string. NULL·CFString 이 아닌 ref(AXValueRef of kAXValueTypeIllegal 등)·
 * 변환 실패는 빈 문자열 — 잘못된 selector 호출로 인한 native crash 를 막는다.
 */
export function cfStrToJs(ref: unknown): string {
  if (!ref) return '';
  const f = getCfFns();
  if (f.getTypeID(ref) !== cfStringTypeId()) return '';
  // 빠른 경로: 8-bit 저장 CFString 은 포인터를 바로 반환한다.
  const ptr = f.strPtr(ref, kCFStringEncodingUTF8);
  if (typeof ptr === 'string') return ptr;
  // 폴백: UTF-16 저장 CFString (대부분의 앱 이름) — 버퍼로 복사.
  const buf = Buffer.alloc(CF_STRING_COPY_BUFFER_BYTES);
  if (!f.strGetCString(ref, buf, buf.length, kCFStringEncodingUTF8)) return '';
  const nul = buf.indexOf(0);
  return buf.subarray(0, nul < 0 ? buf.length : nul).toString('utf8');
}

/** CFNumber → JS number. NULL 은 0. */
export function cfNumToJs(ref: unknown): number {
  if (!ref) return 0;
  const out = [0.0];
  getCfFns().numVal(ref, kCFNumberDoubleType, out);
  return out[0];
}
