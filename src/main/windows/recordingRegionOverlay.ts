import { BrowserWindow, screen } from 'electron';
import { is } from '@electron-toolkit/utils';
import { configureFloatingWindow } from './common';

type Rect = { x: number; y: number; w: number; h: number };

/*
 * ASIS 시그니처 "캡처 프레임" 의 녹화 상태 — renderer 없이 CSS 문자열로 그리므로
 * src/renderer/design-system/asset/tokens.css 의 --frame-* 와 같은 수치를 상수로 둔다.
 * 얇은 선 + 바깥 대비용 어두운 테두리 + 네 모서리의 굵은 브래킷. 전부 rect *바깥*.
 */
/** --frame-bracket. 창 여백도 이 두께 — 브래킷이 가장 바깥까지 닿는다. */
const BRACKET = 3;
/** --frame-bracket-length — 브래킷 팔 길이(rect 모서리부터). */
const BRACKET_LENGTH = 14;
/** --frame-recording */
const RECORDING_COLOR = '#ff4245';
/** --frame-line-edge — 밝은 배경에서도 선이 보이도록 선 바깥 1px. */
const LINE_EDGE_COLOR = 'rgba(0, 0, 0, 0.35)';

/**
 * GIF·영상 녹화 중 "지금 이 영역을 녹화 중" 임을 알리는 테두리 오버레이.
 *
 * 테두리를 녹화 rect *바깥* 에만 그린다 — setContentProtection 에 기대지 않는다.
 * 실측(macOS 26.3, Electron 39): 보호 창은 `screencapture -R`(GIF) 결과에서는 빠지지만
 * ffmpeg avfoundation(영상) 결과에는 그대로 찍힌다. 그래서 위치로 보장한다.
 * 창 영역 중 rect 와 겹치는 가운데는 완전 투명(alpha 0)이라 합성 결과에 아무것도
 * 남지 않는다 (보호를 끈 상태에서도 rect 내부 빨간 픽셀 0 — 실측).
 *
 * 창이 디스플레이 밖으로 나가면 macOS 가 frame 을 안쪽으로 밀어 테두리가 rect 를
 * 침범할 수 있다. 그래서 창 bounds 를 직접 디스플레이 안으로 clamp 하고, 잘린 변은
 * 테두리 두께를 0 으로 둔다 (rect 가 화면 가장자리에 붙은 변은 테두리 없음).
 * rect 가 여러 디스플레이에 걸치면 디스플레이마다 창을 하나씩 띄운다 — 한 창이
 * 디스플레이 경계를 넘으면 clamp 로 반대쪽 테두리가 사라지고, scale 이 다른
 * 디스플레이 사이에서는 창 하나의 배율도 하나뿐이다.
 * rect 가 디스플레이 전체면 그릴 자리가 없어 창을 띄우지 않는다.
 *
 * renderer 엔트리·preload 없이 data: URL + CSS 만 쓴다 — IPC 가 필요 없는 정적 표시.
 */
export class RecordingRegionOverlay {
  private wins: BrowserWindow[] = [];

  show(rect: Rect): void {
    // 이전 세션 창이 남아 있으면 정리하고 새로 띄운다 — 두 개 겹치지 않게.
    this.hide();

    let shown = 0;
    for (const display of screen.getAllDisplays()) {
      // 확장 rect 와 안 겹치는 디스플레이는 computeLayout 이 null 을 준다.
      const layout = computeLayout(rect, display.bounds);
      if (!layout) continue;
      this.wins.push(createFrameWindow(layout));
      shown++;
    }
    if (shown === 0 && is.dev) {
      // rect 가 디스플레이 전체를 덮음 — 바깥에 그릴 자리가 없다. 녹화 자체는 정상 진행.
      console.info('[asis] recordingRegionOverlay: rect 바깥에 그릴 자리가 없어 테두리 생략');
    }
  }

  /** 여러 번 불러도 안전. */
  hide(): void {
    const wins = this.wins;
    this.wins = [];
    for (const win of wins) {
      if (!win.isDestroyed()) win.destroy();
    }
  }
}

function createFrameWindow(layout: Layout): BrowserWindow {
  const win = new BrowserWindow({
    ...layout.bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    roundedCorners: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    enableLargerThanScreen: true,
    // NSPanel — 전체화면 Space 위에도 Space 전환 없이 뜬다(selectionOverlay 와 동일).
    type: 'panel',
    webPreferences: { sandbox: true },
  });
  // 녹화 알약·카운트다운(screen-saver) 보다 한 단계 아래 — 겹쳐도 알약이 위.
  configureFloatingWindow(win, 'pop-up-menu');
  // 클릭·스크롤을 녹화 대상 앱으로 통과.
  win.setIgnoreMouseEvents(true);
  // 방어용 — screencapture 에서는 창이 통째로 빠진다. avfoundation 은 무시하므로 바깥 배치가 1차 보장.
  win.setContentProtection(true);

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(frameHtml(layout.inner))}`)
    .then(() => {
      // 로드 중 hide() 됐으면 이미 destroy 상태.
      if (win.isDestroyed()) return;
      // focus 를 뺏지 않는다 — show() 는 앱 활성화 → 전체화면 Space 전환을 유발한다.
      win.showInactive();
    })
    .catch((err: unknown) => {
      // 테두리 표시 실패 — 안내용 UI 일 뿐 녹화는 계속된다.
      console.warn('[asis] recordingRegionOverlay load failed', err);
    });
  return win;
}

type Borders = { top: number; right: number; bottom: number; left: number };
type Box = { x: number; y: number; width: number; height: number };
/** bounds: 창(전역 좌표). inner: 창 안에서 rect 가 차지하는 영역(창 기준 좌표). */
type Layout = { bounds: Box; inner: Box; borders: Borders };

/**
 * rect 를 BRACKET 만큼 확장한 창 bounds 를 디스플레이 안으로 clamp 하고, 각 변의
 * 테두리 두께 = (창 가장자리 ~ rect 가장자리) 거리로 계산한다.
 *
 * 좌상단은 floor, 우하단은 ceil — rect 가 소수 좌표여도 테두리가 rect 안쪽 픽셀을
 * 침범하지 않는다. 그릴 변이 하나도 없으면 null.
 */
export function computeLayout(
  rect: Rect,
  display: { x: number; y: number; width: number; height: number },
): Layout | null {
  const innerLeft = Math.floor(rect.x);
  const innerTop = Math.floor(rect.y);
  const innerRight = Math.ceil(rect.x + rect.w);
  const innerBottom = Math.ceil(rect.y + rect.h);

  const left = Math.max(display.x, innerLeft - BRACKET);
  const top = Math.max(display.y, innerTop - BRACKET);
  const right = Math.min(display.x + display.width, innerRight + BRACKET);
  const bottom = Math.min(display.y + display.height, innerBottom + BRACKET);

  const borders: Borders = {
    top: Math.max(0, innerTop - top),
    right: Math.max(0, right - innerRight),
    bottom: Math.max(0, bottom - innerBottom),
    left: Math.max(0, innerLeft - left),
  };
  if (borders.top + borders.right + borders.bottom + borders.left === 0) return null;
  if (right <= left || bottom <= top) return null;

  return {
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
    inner: {
      x: innerLeft - left,
      y: innerTop - top,
      width: innerRight - innerLeft,
      height: innerBottom - innerTop,
    },
    borders,
  };
}

/**
 * .rect 는 rect 자리에 놓인 투명 박스. outline·box-shadow(바깥)는 박스 *바깥* 에만
 * 칠해지고, 브래킷은 rect 모서리에서 바깥쪽 BRACKET 만큼 비켜 선 L 자라 팔이 전부
 * rect 밖에 놓인다. 디스플레이 clamp 로 잘린 쪽은 창 가장자리에서 자연히 잘린다.
 */
function frameHtml(inner: Box): string {
  const arm = BRACKET + BRACKET_LENGTH;
  const corner = (v: 'top' | 'bottom', h: 'left' | 'right'): string =>
    `<i style="${v}:-${BRACKET}px;${h}:-${BRACKET}px;border-${v}-width:${BRACKET}px;border-${h}-width:${BRACKET}px"></i>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
.rect{position:fixed;left:${inner.x}px;top:${inner.y}px;width:${inner.width}px;height:${inner.height}px;
outline:1px solid ${RECORDING_COLOR};box-shadow:0 0 0 2px ${LINE_EDGE_COLOR}}
i{position:absolute;width:${arm}px;height:${arm}px;box-sizing:border-box;border:0 solid ${RECORDING_COLOR}}
</style></head><body><div class="rect">${
  corner('top', 'left') + corner('top', 'right') + corner('bottom', 'left') + corner('bottom', 'right')
}</div></body></html>`;
}

export const recordingRegionOverlay = new RecordingRegionOverlay();
