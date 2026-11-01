import { unlink } from 'node:fs/promises';
import { nativeImage, screen } from 'electron';
import { captureRegion } from '../capture/capture';
import { getElementBoundsAtPoint, listWindows } from '../windowsInfo';
import type { ClickPoint } from './clickMonitor';
import type { Guide, StepKind, StepTarget } from './stepGuideExport';

/**
 * 스텝 가이드의 캡처 단위 작업 — 클릭 한 번을 image 스텝으로 만드는 함수와 그 보조 함수.
 * StepGuideManager(상태 머신)와 분리해 둔 순수/단발성 모듈 함수들.
 *
 * imperative-style.md — 모듈 함수는 명령형 OK.
 * null-safety.md — 캡처 실패/빈 이미지/AX 실패는 명시 분기, 스텝 미기록 또는 라벨 없이 진행.
 */

/** 캡처된 스텝의 raw 데이터(export 전 중간 표현). */
export type RawStep = {
  /** 'image'=클릭 시점 정지 PNG, 'gif'=[GIF 시작]~[GIF 정지] 구간 연속 애니메이션. */
  kind: StepKind;
  imagePath: string;
  imageDataUrl: string;
  width: number;
  height: number;
  clickX: number;
  clickY: number;
  timestamp: number;
  target?: StepTarget;
  label?: string;
  appName?: string;
};

/** layer 0(일반 앱 창)인데도 앱 칩으로 쓰면 안 되는 시스템 소유 창 — layer 필터의 보조 안전망. */
const SYSTEM_WINDOW_OWNERS = new Set(['Window Server', 'WindowManager', 'Control Center', 'Notification Center']);

/**
 * AX 역할명(AXRoleDescription) — getElementBoundsAtPoint 는 AXTitle 이 없으면 역할명으로
 * 대체하는데, '"group" 항목을 클릭합니다' 같은 문장은 읽는 사람에게 정보가 없다.
 * 이런 값은 라벨이 없는 것으로 보고 "표시된 위치를 클릭합니다" 로 쓴다.
 * 역할명은 앱 로캘을 따르므로 영어·한국어를 함께 둔다(완전한 목록은 아님 — 실측된 것 위주).
 */
const GENERIC_ROLE_NAMES = new Set([
  'group', 'button', 'menu item', 'menu bar item', 'menu', 'menu bar', 'text', 'static text',
  'image', 'cell', 'row', 'column', 'scroll area', 'split group', 'toolbar', 'window',
  'standard window', 'dialog', 'text field', 'text entry area', 'checkbox', 'radio button',
  'pop up button', 'menu button', 'tab', 'tab group', 'link', 'heading', 'list', 'table',
  'outline', 'web area', 'html content', 'slider', 'application', 'unknown',
  '그룹', '버튼', '메뉴 항목', '메뉴 막대 항목', '메뉴', '텍스트', '이미지', '셀', '행', '열',
  '스크롤 영역', '도구 막대', '윈도우', '표준 윈도우', '텍스트 필드', '체크상자', '팝업 버튼',
  '탭', '링크', '표제', '목록', '표', 'HTML 콘텐츠',
]);

/** AX 이름 → 문장에 쓸 라벨. 비었거나 역할명뿐이면 undefined. */
function meaningfulLabel(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  if (GENERIC_ROLE_NAMES.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

/** 요소 영역이 디스플레이의 이 비율보다 크면(창 전체·스크롤 영역 등) 강조 박스를 생략한다. */
const MAX_TARGET_AREA_RATIO = 0.35;

/**
 * 정지 이미지 스텝 캡처 — point 가 속한 디스플레이 전체의 정지 PNG 를 image 스텝으로.
 *   - 클릭의 이미지 내 픽셀 좌표 = (clickDip - displayOrigin) * scaleFactor.
 *   - AX 요소 이름 조회(권한 있으면). 실패 시 라벨 없이 진행.
 * 캡처 취소/빈 이미지면 null 반환(스텝 미기록).
 */
export async function captureImageStep(point: ClickPoint): Promise<RawStep | null> {
  // point 는 top-left origin DIP(clickMonitor 가 flip 완료). 이 좌표가 속한
  // 디스플레이를 찾아 그 전체를 캡처한다 — 다중 모니터 안전.
  const display = screen.getDisplayNearestPoint({ x: point.x, y: point.y });
  const b = display.bounds;

  // AX 라벨은 캡처 *전에* 조회한다 — 캡처 후엔 화면이 바뀌었을 수 있음.
  // 권한 없거나 실패 시 null → 라벨 없이 진행(정상 fallback).
  const element = getElementBoundsAtPoint(point.x, point.y);
  const label = meaningfulLabel(element?.name);

  // 캡처를 먼저 걸고 창 목록 조회는 그 뒤에 — 클릭 직후 화면을 최대한 빨리 잡는다.
  const capPromise = captureRegion({ x: b.x, y: b.y, w: b.width, h: b.height });
  const appName = await appNameAtPoint(point);
  const cap = await capPromise;
  if (cap.kind !== 'success') {
    // 사용자 취소(ESC) 등 — 스텝 미기록.
    console.warn('[asis] stepGuide: 캡처가 성공하지 않음', cap.kind);
    return null;
  }

  // createFromPath 는 동기로 픽셀을 메모리에 올린다 → 디스플레이 전체 Retina PNG(수 MB)
  // tmp 파일은 바로 지워도 된다. 스텝은 dataURL 만 들고 다닌다.
  const image = nativeImage.createFromPath(cap.path);
  removeTmpFile(cap.path);
  if (image.isEmpty()) {
    console.warn('[asis] stepGuide: 캡처 이미지가 비어 있음', cap.path);
    return null;
  }
  const size = image.getSize();

  // 클릭의 이미지 내 픽셀 좌표. screencapture 는 physical px 출력이므로 scaleFactor 적용.
  const sf = display.scaleFactor || 1;
  const clickX = Math.round((point.x - b.x) * sf);
  const clickY = Math.round((point.y - b.y) * sf);

  // 요소 영역(DIP) → 이미지 픽셀. 디스플레이 밖으로 걸치면 잘라내고, 너무 크면 생략.
  let target: StepTarget | undefined;
  if (element) {
    const left = Math.max(element.x, b.x);
    const top = Math.max(element.y, b.y);
    const right = Math.min(element.x + element.w, b.x + b.width);
    const bottom = Math.min(element.y + element.h, b.y + b.height);
    const area = (right - left) * (bottom - top);
    if (right > left && bottom > top && area <= b.width * b.height * MAX_TARGET_AREA_RATIO) {
      target = {
        x: Math.round((left - b.x) * sf),
        y: Math.round((top - b.y) * sf),
        w: Math.round((right - left) * sf),
        h: Math.round((bottom - top) * sf),
      };
    }
  }

  return {
    kind: 'image',
    imagePath: cap.path,
    imageDataUrl: image.toDataURL(),
    width: size.width,
    height: size.height,
    clickX,
    clickY,
    timestamp: Date.now(),
    target,
    label,
    appName,
  };
}

/** RawStep[] → 편집 창에 넘길 Guide. 제목·문장은 문서 생성 시 기본값으로 채운다. */
export function buildGuide(rawSteps: RawStep[]): Guide {
  return {
    createdAt: Date.now(),
    steps: rawSteps.map((r) => ({
      kind: r.kind,
      imageDataUrl: r.imageDataUrl,
      width: r.width,
      height: r.height,
      clickX: r.clickX,
      clickY: r.clickY,
      target: r.target,
      label: r.label,
      appName: r.appName,
    })),
  };
}

/**
 * 클릭 지점의 창 주인 앱 이름 — 문서의 앱 칩용.
 * listWindows 는 화면 앞쪽 창부터 나열한다(CGWindowList on-screen 순서). 모르면 undefined.
 */
async function appNameAtPoint(point: ClickPoint): Promise<string | undefined> {
  const windows = await listWindows();
  for (const w of windows) {
    // layer 0 = 일반 앱 창. 메뉴 막대 앱(실측 layer 3)·Dock(20)·오버레이 창이
    // 앞에 있어도 클릭한 앱 이름을 가로채지 않게 한다(windowsInfo.ts WindowInfo.layer).
    if (w.layer !== 0) continue;
    if (SYSTEM_WINDOW_OWNERS.has(w.name)) continue;
    if (point.x >= w.x && point.x < w.x + w.w && point.y >= w.y && point.y < w.y + w.h) {
      return w.name;
    }
  }
  return undefined;
}

/** tmp 파일 삭제 — fire-and-forget. 이미 없으면 조용히, 그 밖의 실패는 로그만. */
function removeTmpFile(path: string): void {
  unlink(path).catch((err: unknown) => {
    if (!isEnoent(err)) console.warn('[asis] stepGuide: tmp 파일 정리 실패', path, err);
  });
}

/** gif 스텝의 tmp GIF 파일 삭제. image 스텝의 PNG 는 캡처 직후 이미 지웠다. */
export function cleanupTmpGifs(steps: Pick<RawStep, 'kind' | 'imagePath'>[]): void {
  for (const s of steps) {
    if (s.kind === 'gif') removeTmpFile(s.imagePath);
  }
}

/** ENOENT(파일 없음) 판별 — 이미 지워진 tmp 파일 정리 시 무시용. */
export function isEnoent(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
