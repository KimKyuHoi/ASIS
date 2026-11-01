import koffi from 'koffi';
import {
  cfRelease,
  getCGRectStruct,
  loadCoreFoundation,
  registerAxRefType,
  registerCfRefType,
} from './coreFoundation';

/**
 * AXUIElement koffi 바인딩과 attribute 읽기 헬퍼.
 *
 * AX 함수 시그니처는 CfRef 로 통일한다 — copyAttrValue 의 out 결과가 CFString
 * (예: AXTitle) 일 때 cfStrToJs 에 그대로 넘길 수 있도록. AXRef·CFTypeRef·CFStringRef
 * 모두 raw opaque pointer 이므로 이름만 통일하면 안전하다. 해제도 같은 CFRelease 를 쓴다.
 */

const APPLICATION_SERVICES_PATH =
  '/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices';

const kAXErrorSuccess = 0;
const kAXValueCGRectType = 3;
/** 이보다 작은 frame 은 숨은/장식 요소 — 선택 대상에서 뺀다. */
const MIN_ELEMENT_SIZE = 2;

/** 숨은/장식 요소 크기인지 — AX frame 과 CGWindow bounds 모두 같은 기준을 쓴다. */
export function isTooSmall({ w, h }: { w: number; h: number }): boolean {
  return w < MIN_ELEMENT_SIZE || h < MIN_ELEMENT_SIZE;
}

type CGRect = { x: number; y: number; width: number; height: number };

// FFI 시그니처는 네이티브 함수의 인자 수를 그대로 따른다 — 3개를 넘는 함수는 rest tuple.
type AxFns = {
  createSystemWide: () => unknown;
  // PID 기준 AX root — Dock children enumerate 처럼 특정 process 의 UI 트리에 접근.
  createApp: (pid: number) => unknown;
  elementAtPos: (...args: [sys: unknown, x: number, y: number, out: unknown[]]) => number;
  copyAttrValue: (el: unknown, attr: unknown, out: unknown[]) => number;
  // batch — 여러 attribute 를 1번의 AX IPC 로 읽는다.
  copyMultipleAttrValues: (
    ...args: [el: unknown, attrs: unknown, options: number, out: unknown[]]
  ) => number;
  axValueGetValue: (val: unknown, type: number, out: CGRect[]) => boolean;
  arrayGet: (arr: unknown, idx: number) => unknown;
  arrayCreateMutable: (alloc: null, capacity: number, callbacks: null) => unknown;
  arrayAppendValue: (arr: unknown, val: unknown) => void;
};

let axFns: AxFns | null = null;

export function getAxFns(): AxFns {
  if (axFns) return axFns;
  registerCfRefType(); // 'CfRef' 가 레지스트리에 있어야 아래 시그니처 파싱이 된다.
  registerAxRefType();
  const CGRectStruct = getCGRectStruct();
  const AS = koffi.load(APPLICATION_SERVICES_PATH);
  const CF = loadCoreFoundation();
  axFns = {
    createSystemWide: AS.func('CfRef AXUIElementCreateSystemWide()'),
    createApp: AS.func('CfRef AXUIElementCreateApplication(int)'),
    elementAtPos: AS.func('int32 AXUIElementCopyElementAtPosition(CfRef, float, float, _Out_ CfRef *)'),
    copyAttrValue: AS.func('int32 AXUIElementCopyAttributeValue(CfRef, CfRef, _Out_ CfRef *)'),
    copyMultipleAttrValues: AS.func(
      'int32 AXUIElementCopyMultipleAttributeValues(CfRef, CfRef, uint32, _Out_ CfRef *)',
    ),
    axValueGetValue: AS.func('AXValueGetValue', 'bool', [
      'CfRef',
      'int32',
      koffi.out(koffi.pointer(CGRectStruct)),
    ]),
    arrayGet: CF.func('CfRef CFArrayGetValueAtIndex(CfRef, long)'),
    arrayCreateMutable: CF.func('CFArrayCreateMutable', 'CfRef', ['CfRef', 'long', koffi.pointer('uint8')]),
    arrayAppendValue: CF.func('void CFArrayAppendValue(CfRef, CfRef)'),
  };
  return axFns;
}

/** 화면 좌표의 가장 구체적인 AXUIElement. 실패 시 null. 호출자가 cfRelease 한다. */
export function copyElementAtPosition(screenX: number, screenY: number): unknown {
  const f = getAxFns();
  const sys = f.createSystemWide();
  const out: unknown[] = [null];
  const err = f.elementAtPos(sys, screenX, screenY, out);
  cfRelease(sys);
  return err === kAXErrorSuccess ? out[0] : null;
}

/** 단일 attribute 값. 실패 시 null. 호출자가 cfRelease 한다. */
export function copyAttributeValue(el: unknown, key: unknown): unknown {
  const out: unknown[] = [null];
  const err = getAxFns().copyAttrValue(el, key, out);
  return err === kAXErrorSuccess ? out[0] : null;
}

/**
 * 여러 attribute 를 1번의 AX IPC 로 읽는다 — AX IPC 비용이 FFI 비용보다 커서 의미 있는 절감.
 * 결과는 keys 순서의 CFArray (실패 시 null). 호출자가 cfRelease 한다.
 * 실패한 attribute 자리에는 kAXValueTypeIllegal AXValueRef 가 들어 있다 —
 * cfStrToJs 는 빈 문자열, readFrame 은 null 로 자연스럽게 처리한다.
 */
export function copyAttributeValues(el: unknown, keys: unknown[]): unknown {
  const f = getAxFns();
  const attrArr = f.arrayCreateMutable(null, keys.length, null);
  for (const key of keys) f.arrayAppendValue(attrArr, key);
  const out: unknown[] = [null];
  const err = f.copyMultipleAttrValues(el, attrArr, 0, out);
  cfRelease(attrArr);
  return err === kAXErrorSuccess ? out[0] : null;
}

/** AXFrame(AXValue of CGRect) → bounds. 변환 실패·너무 작은 frame 은 null. */
export function readFrame(
  frameVal: unknown,
): { x: number; y: number; w: number; h: number } | null {
  if (!frameVal) return null;
  const rectOut = [{ x: 0, y: 0, width: 0, height: 0 }];
  if (!getAxFns().axValueGetValue(frameVal, kAXValueCGRectType, rectOut)) return null;
  const { x, y, width: w, height: h } = rectOut[0];
  const bounds = { x, y, w, h };
  return isTooSmall(bounds) ? null : bounds;
}
