import { systemPreferences } from 'electron';
import {
  copyAttributeValue,
  copyAttributeValues,
  copyElementAtPosition,
  getAxFns,
  isTooSmall,
  readFrame,
} from './windows-info/accessibility';
import { cfNumToJs, cfRelease, cfStr, cfStrToJs, getCfFns } from './windows-info/coreFoundation';

export { onSpaceChange } from './windows-info/spaceNotify';

/**
 * macOS 의 *모든 visible 윈도우* 와 마우스 아래 UI 요소의 bounds 를 받아오는 모듈.
 *
 * 구현: koffi FFI + CGWindowListCopyWindowInfo (CoreGraphics) / AXUIElement.
 *   child process (osascript 등) 는 Automation / Screen Recording 권한이
 *   부모 프로세스에서 상속되지 않아 실패하므로, main process 안에서 직접 호출.
 *   네이티브 바인딩은 `windows-info/` 에 있고 이 파일은 공개 API 만 조합한다.
 *
 * UI 자동 감지 (Snipaste/CleanShot 시그니처): selection overlay 에서 마우스
 * hover 시 윈도우 윤곽 자동 표시 + 클릭 한 번으로 그 영역 선택.
 */

export type ElementBounds = { x: number; y: number; w: number; h: number; name?: string };

export type WindowInfo = {
  id: number;
  name: string;
  /**
   * kCGWindowLayer — 0 = 일반 앱 창. 메뉴바·상태바 아이템·투명 오버레이 등은 0 이 아니다.
   * "클릭한 앱이 무엇인가"처럼 일반 창만 봐야 하는 소비자는 layer === 0 으로 거른다.
   */
  layer: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

const kCGWindowListOptionOnScreenOnly = 1 << 0;
const kCGWindowListExcludeDesktopElements = 1 << 4;
const kCGNullWindowID = 0;

/**
 * kCGWindowBounds 를 그대로 쓸 수 없는 owner.
 * - screencapture: ASIS 자신이 color picker 용 background 캡처로 spawn 한 자식 process.
 * - Dock: bounds 가 화면 전체로 보고되어 cursor 어디에든 hit 한다 → getDockItems 가
 *   AX 로 개별 아이콘을 따로 가져온다.
 */
const SCREENCAPTURE_OWNER = 'screencapture';
const DOCK_OWNER = 'Dock';

/**
 * 스냅 후보에서 빼는 macOS 시스템 창 owner.
 * - Window Server: 메뉴바·커서·디스플레이 backstop 같은 합성기 내부 창. 화면 전체 크기로 잡혀
 *   "Window Server" 스냅 박스가 뜬다.
 * - screencaptureui: macOS 기본 스크린샷(⌘⇧4·⌘⇧5) 대기 화면. owner 이름이 시스템 언어로
 *   현지화돼 보고된다 (한국어 '스크린샷', 영어 'Screenshot' — macOS 26.3 실측).
 */
const SYSTEM_UI_OWNERS: ReadonlySet<string> = new Set([
  'Window Server',
  'screencaptureui',
  'Screenshot',
  '스크린샷',
]);

/**
 * listWindows 가 Dock 윈도우를 만날 때 기록하는 Dock process PID — getDockItems 가 사용한다.
 * 첫 listWindows 전에는 null 이고, 그때 getDockItems 는 null 을 반환한다.
 */
let lastDockPid: number | null = null;

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
let axPermissionGranted = false;
function hasAccessibilityPermission(): boolean {
  if (!axPermissionGranted) axPermissionGranted = ensureAccessibilityPermission(false);
  return axPermissionGranted;
}

// ---------------------------------------------------------------------------
// CGWindowList
// ---------------------------------------------------------------------------

type WindowDictKeys = Record<
  'bounds' | 'owner' | 'pid' | 'number' | 'layer' | 'x' | 'y' | 'w' | 'h',
  unknown
>;

type WindowEntry = { pid: number; owner: string; info: WindowInfo };

/** CGWindowList 의 윈도우 dictionary 하나를 읽는다. 항목·bounds 가 없으면 null. */
function readWindowEntry(win: unknown, keys: WindowDictKeys): WindowEntry | null {
  // NULL dictionary 를 CFDictionaryGetValue 에 넘기면 native crash.
  if (!win) return null;
  const { dictGet } = getCfFns();
  const boundsRef = dictGet(win, keys.bounds);
  if (!boundsRef) return null;
  const owner = cfStrToJs(dictGet(win, keys.owner));
  return {
    pid: cfNumToJs(dictGet(win, keys.pid)),
    owner,
    info: {
      id: cfNumToJs(dictGet(win, keys.number)),
      name: owner,
      layer: cfNumToJs(dictGet(win, keys.layer)),
      x: cfNumToJs(dictGet(boundsRef, keys.x)),
      y: cfNumToJs(dictGet(boundsRef, keys.y)),
      w: cfNumToJs(dictGet(boundsRef, keys.w)),
      h: cfNumToJs(dictGet(boundsRef, keys.h)),
    },
  };
}

function listWindowsSync(): WindowInfo[] {
  const f = getCfFns();
  const list = f.winList(
    kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
    kCGNullWindowID,
  );
  if (!list) return [];

  // 루프 안 반복 생성 방지 — CFString 키를 미리 만들어 둔다.
  const keys: WindowDictKeys = {
    bounds: cfStr('kCGWindowBounds'),
    owner: cfStr('kCGWindowOwnerName'),
    pid: cfStr('kCGWindowOwnerPID'),
    number: cfStr('kCGWindowNumber'),
    layer: cfStr('kCGWindowLayer'),
    x: cfStr('X'),
    y: cfStr('Y'),
    w: cfStr('Width'),
    h: cfStr('Height'),
  };

  const windows: WindowInfo[] = [];
  const count = f.arrCount(list);
  for (let i = 0; i < count; i++) {
    const entry = readWindowEntry(f.arrGet(list, i), keys);
    if (!entry || entry.pid === process.pid || isTooSmall(entry.info)) continue;
    // owner name 이 빈 윈도우 = macOS 내부 레이어 (Desktop 배경, 알림센터 등).
    if (!entry.owner || entry.owner === SCREENCAPTURE_OWNER) continue;
    if (SYSTEM_UI_OWNERS.has(entry.owner)) continue;
    if (entry.owner === DOCK_OWNER) {
      lastDockPid = Math.round(entry.pid);
      continue;
    }
    windows.push(entry.info);
  }

  cfRelease(...Object.values(keys), list);
  return windows;
}

/**
 * 모든 visible 윈도우의 position + size 를 list 로 반환.
 * 부수효과: Dock 윈도우를 만나면 그 PID 를 기록한다 (getDockItems 용).
 * koffi 초기화·호출 실패 시 빈 배열 — overlay 는 수동 선택만으로 동작.
 */
export function listWindows(): Promise<WindowInfo[]> {
  try {
    return Promise.resolve(listWindowsSync());
  } catch (err: unknown) {
    console.warn('[asis] listWindows koffi 실패:', err);
    return Promise.resolve([]);
  }
}

// ---------------------------------------------------------------------------
// AXUIElement
// ---------------------------------------------------------------------------

/**
 * 라벨 우선 순위: AXTitle(구체 라벨) → AXRoleDescription(역할명, 예: "버튼")
 * → AXDescription(대체 설명). 마지막 자리는 AXFrame.
 */
const ELEMENT_LABEL_ATTRIBUTES = ['AXTitle', 'AXRoleDescription', 'AXDescription'];

function readElementBounds(el: unknown): ElementBounds | null {
  const keys = [...ELEMENT_LABEL_ATTRIBUTES, 'AXFrame'].map(cfStr);
  const values = copyAttributeValues(el, keys);
  cfRelease(...keys);
  if (!values) return null;

  const { arrayGet } = getAxFns();
  const labels = ELEMENT_LABEL_ATTRIBUTES.map((_, i) => cfStrToJs(arrayGet(values, i)));
  const frame = readFrame(arrayGet(values, ELEMENT_LABEL_ATTRIBUTES.length));
  cfRelease(values);
  if (!frame) return null;

  const name = labels.find((label) => label !== '');
  return { ...frame, name };
}

/**
 * 주어진 macOS 스크린 좌표(논리 픽셀)에서 가장 구체적인 AXUIElement 의 frame 반환.
 * 손쉬운 사용 권한이 없거나 실패하면 null.
 */
export function getElementBoundsAtPoint(screenX: number, screenY: number): ElementBounds | null {
  if (!hasAccessibilityPermission()) return null;
  try {
    const el = copyElementAtPosition(screenX, screenY);
    if (!el) return null;
    const bounds = readElementBounds(el);
    cfRelease(el);
    return bounds;
  } catch (err: unknown) {
    console.warn('[asis] getElementBoundsAtPoint 실패:', err);
    return null;
  }
}

/**
 * Dock 의 아이콘 컨테이너(AXList) 의 children 배열. 실패 시 null. 호출자가 cfRelease 한다.
 *
 * Dock 의 AX 구조:
 *   Dock(app) → AXChildren → [AXList(items)] → AXChildren → [AXDockItem, ...]
 */
function copyDockItemArray(dockPid: number): unknown {
  const f = getAxFns();
  const childrenKey = cfStr('AXChildren');
  const dockApp = f.createApp(dockPid);
  const topChildren = copyAttributeValue(dockApp, childrenKey);
  cfRelease(dockApp);
  // Dock 의 top child[0] = AXList(아이콘 컨테이너). topChildren 이 소유하므로 해제 전에 읽는다.
  const hasList = topChildren !== null && getCfFns().arrCount(topChildren) > 0;
  const items = hasList ? copyAttributeValue(f.arrayGet(topChildren, 0), childrenKey) : null;
  cfRelease(childrenKey);
  if (topChildren !== null) cfRelease(topChildren);
  return items;
}

/**
 * Dock 아이콘의 layer — AX 로 읽어 CGWindowList 값이 없으므로 Dock 창 레벨을 쓴다.
 * CGWindowLevelForKey(.dockWindow) = 20 (macOS 26.3 실측).
 */
const DOCK_ITEM_LAYER = 20;

type DockItemKeys = [title: unknown, frame: unknown];

/** AXDockItem 하나 → WindowInfo. id 는 CGWindowID 와 겹치지 않도록 음수 + index. */
function readDockItem(item: unknown, index: number, keys: DockItemKeys): WindowInfo | null {
  const values = copyAttributeValues(item, keys);
  if (!values) return null;
  const { arrayGet } = getAxFns();
  const title = cfStrToJs(arrayGet(values, 0));
  const frame = readFrame(arrayGet(values, 1));
  cfRelease(values);
  if (!frame) return null;
  return { id: -1 - index, name: title || DOCK_OWNER, layer: DOCK_ITEM_LAYER, ...frame };
}

function readDockItems(dockItemArr: unknown): WindowInfo[] {
  const keys: DockItemKeys = [cfStr('AXTitle'), cfStr('AXFrame')];
  const items: WindowInfo[] = [];
  const count = getCfFns().arrCount(dockItemArr);
  for (let i = 0; i < count; i++) {
    const item = getAxFns().arrayGet(dockItemArr, i);
    const info = item ? readDockItem(item, i, keys) : null;
    if (info) items.push(info);
  }
  cfRelease(...keys);
  return items;
}

/**
 * Dock 아이콘 enumerate — listWindows 에서 Dock 을 제외하는 대신 AX 로
 * 개별 AXDockItem 의 AXTitle + AXFrame 을 가져온다.
 *
 * listWindows 가 Dock PID 를 기록한 뒤에만 동작한다.
 * AX 권한 없거나 enumerate 실패 시 null — 호출자는 빈 목록으로 처리.
 */
export function getDockItems(): WindowInfo[] | null {
  if (lastDockPid === null || !hasAccessibilityPermission()) return null;
  try {
    const dockItemArr = copyDockItemArray(lastDockPid);
    if (!dockItemArr) return null;
    const items = readDockItems(dockItemArr);
    cfRelease(dockItemArr);
    return items;
  } catch (err: unknown) {
    console.warn('[asis] getDockItems 실패:', err);
    return null;
  }
}
