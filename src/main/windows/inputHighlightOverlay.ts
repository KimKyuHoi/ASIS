import { BrowserWindow, screen } from 'electron';
import { configureFloatingWindow } from './common';

type Rect = { x: number; y: number; w: number; h: number };
type Box = { x: number; y: number; width: number; height: number };

/*
 * 표시 모양 — renderer 없이 CSS 문자열로 그리므로 design-system tokens.css 값을 상수로 둔다
 * (recordingRegionOverlay.ts 와 같은 방식).
 */
/** --accent (= --p-orange-500). 클릭 링. */
const ACCENT = '#ff6f0f';
/** --hud-bg / --hud-border / --hud-label / --hud-shadow. 키 배지는 녹화 알약과 같은 HUD 면. */
const HUD_BG = 'rgba(30, 30, 30, 0.88)';
const HUD_BORDER = 'rgba(255, 255, 255, 0.12)';
const HUD_LABEL = 'rgba(255, 255, 255, 0.92)';
const HUD_SHADOW = '0 8px 24px rgba(0, 0, 0, 0.35), 0 0 0 0.5px rgba(0, 0, 0, 0.6)';
/** --radius-group, --font-ui, --weight-semibold. */
const RADIUS = 10;
const FONT_UI = "-apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', sans-serif";
const WEIGHT = 600;

/**
 * 링 애니메이션 길이(ms). GIF 는 screencapture 를 프레임마다 spawn 해 실측 3~6fps 라
 * 짧으면 프레임 사이로 빠진다 — 900ms 면 최저 3fps 에서도 2~3 프레임에 걸린다.
 */
const RIPPLE_MS = 900;
/** 키 배지 표시 시간(ms). 다음 키가 오면 즉시 교체되고 타이머를 다시 잰다. */
const KEY_HOLD_MS = 1400;
/**
 * 키 배지와 rect 아래 가장자리 사이 여백(pt). GIF 녹화 알약이 영역 안 하단에 뜰 때
 * (recorderPlacement.placeInsideBottom: 알약 38 + 여백 24) 와 겹치지 않게 그보다 위.
 */
const KEY_BOTTOM_MARGIN = 80;

/**
 * GIF·화면 녹화 중 클릭 위치(파동 링)와 누른 단축키(⌘⇧4)를 녹화 영역 위에 그리는 투명 창.
 *
 * recordingRegionOverlay 와 반대로 *찍히는 것이 목적* 이라 setContentProtection 을 걸지 않는다.
 * 실측(record-region 세션, macOS 26.3): 보호하지 않은 창은 screencapture -R(GIF) 와
 * ffmpeg avfoundation(화면 녹화) 결과 모두에 찍힌다.
 *
 * rect 가 여러 디스플레이에 걸치면 디스플레이마다 (rect ∩ display) 크기의 창을 하나씩 띄운다 —
 * 창 하나가 경계를 넘으면 macOS 가 frame 을 한 화면 안으로 밀고, 배율도 하나뿐이라서.
 *
 * renderer 엔트리·preload 없이 data: URL 페이지를 띄우고, 이벤트는 executeJavaScript 로
 * 페이지 안 함수(window.__ripple / __key)를 부른다. 넘기는 값은 숫자와 JSON.stringify 한
 * 문자열뿐이라 스크립트 주입 여지가 없다.
 */
export class InputHighlightOverlay {
  private wins: { win: BrowserWindow; bounds: Box }[] = [];
  /** 페이지 로드가 끝나 window.__ripple / __key 가 생긴 창. 그 전 이벤트는 버린다. */
  private readonly ready = new WeakSet<BrowserWindow>();
  /** 키 배지를 그릴 창 — rect 아래 가운데가 걸친 디스플레이의 창. */
  private keyTarget: BrowserWindow | null = null;

  show(rect: Rect): void {
    this.hide();
    const anchor = { x: rect.x + rect.w / 2, y: rect.y + rect.h - 1 };
    for (const display of screen.getAllDisplays()) {
      const bounds = intersect(rect, display.bounds);
      if (!bounds) continue;
      // 배지 bottom(창 기준) — rect 아래 가장자리에서 KEY_BOTTOM_MARGIN 위. 창 밖으로 안 나가게 clamp.
      const rectBottomInWin = Math.min(bounds.height, rect.y + rect.h - bounds.y);
      const keyBottom = Math.max(0, bounds.height - rectBottomInWin + KEY_BOTTOM_MARGIN);
      const win = createHighlightWindow(bounds, keyBottom, (w) => this.ready.add(w));
      this.wins.push({ win, bounds });
      if (contains(bounds, anchor.x, anchor.y)) this.keyTarget = win;
    }
    // anchor 가 디스플레이 사이 틈에 떨어졌을 때 — 첫 창에 그린다.
    if (!this.keyTarget && this.wins.length > 0) this.keyTarget = this.wins[0].win;
  }

  /** 여러 번 불러도 안전. */
  hide(): void {
    const wins = this.wins;
    this.wins = [];
    this.keyTarget = null;
    for (const { win } of wins) {
      if (!win.isDestroyed()) win.destroy();
    }
  }

  /** 전역 좌표(top-left, points) 클릭. rect 밖 클릭은 그리지 않는다. */
  ripple(x: number, y: number): void {
    for (const entry of this.wins) {
      if (!contains(entry.bounds, x, y)) continue;
      if (!this.ready.has(entry.win)) return;
      run(entry.win, `window.__ripple(${String(x - entry.bounds.x)},${String(y - entry.bounds.y)})`);
      return;
    }
  }

  key(label: string): void {
    const win = this.keyTarget;
    if (!win || !this.ready.has(win)) return;
    run(win, `window.__key(${JSON.stringify(label)})`);
  }
}

function run(win: BrowserWindow, code: string): void {
  if (win.isDestroyed()) return;
  win.webContents.executeJavaScript(code).catch((err: unknown) => {
    // 표시는 보조 UI — 실패해도 녹화는 계속된다. hide() 와 경합해 창이 사라진 경우가 대부분.
    console.warn('[asis] inputHighlightOverlay script failed', err);
  });
}

function createHighlightWindow(
  bounds: Box,
  keyBottom: number,
  onReady: (win: BrowserWindow) => void,
): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
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
    // NSPanel — 전체화면 Space 위에도 Space 전환 없이 뜬다(recordingRegionOverlay 와 동일).
    type: 'panel',
    webPreferences: { sandbox: true },
  });
  // 녹화 알약·카운트다운(screen-saver) 아래 — 알약 버튼을 가리지 않는다.
  configureFloatingWindow(win, 'pop-up-menu');
  // 클릭·스크롤은 녹화 대상 앱으로 통과.
  win.setIgnoreMouseEvents(true);

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(highlightHtml(keyBottom))}`)
    .then(() => {
      if (win.isDestroyed()) return;
      onReady(win);
      // focus 를 뺏지 않는다 — show() 는 앱 활성화 → 전체화면 Space 전환을 유발한다.
      win.showInactive();
    })
    .catch((err: unknown) => {
      console.warn('[asis] inputHighlightOverlay load failed', err);
    });
  return win;
}

function highlightHtml(keyBottom: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
.r{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;box-sizing:border-box;
border:3px solid ${ACCENT};background:color-mix(in srgb,${ACCENT} 22%,transparent);
animation:r ${RIPPLE_MS}ms ease-out forwards;pointer-events:none}
@keyframes r{0%{transform:scale(.35);opacity:1}70%{opacity:.85}100%{transform:scale(1.25);opacity:0}}
#k{position:fixed;left:50%;bottom:${keyBottom}px;transform:translateX(-50%);padding:10px 18px;
border-radius:${RADIUS}px;background:${HUD_BG};border:0.5px solid ${HUD_BORDER};box-shadow:${HUD_SHADOW};
color:${HUD_LABEL};font:${WEIGHT} 28px/1.1 ${FONT_UI};letter-spacing:2px;white-space:nowrap;
opacity:0;transition:opacity 160ms ease-out;pointer-events:none}
#k.on{opacity:1}
</style></head><body><div id="k"></div><script>
var k=document.getElementById('k'),t=0;
window.__ripple=function(x,y){var d=document.createElement('div');d.className='r';
d.style.left=x+'px';d.style.top=y+'px';document.body.appendChild(d);
setTimeout(function(){d.remove()},${RIPPLE_MS});};
window.__key=function(s){k.textContent=s;k.classList.add('on');clearTimeout(t);
t=setTimeout(function(){k.classList.remove('on')},${KEY_HOLD_MS});};
</script></body></html>`;
}

function intersect(rect: Rect, d: Box): Box | null {
  const left = Math.max(Math.floor(rect.x), d.x);
  const top = Math.max(Math.floor(rect.y), d.y);
  const right = Math.min(Math.ceil(rect.x + rect.w), d.x + d.width);
  const bottom = Math.min(Math.ceil(rect.y + rect.h), d.y + d.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function contains(b: Box, x: number, y: number): boolean {
  return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;
}
