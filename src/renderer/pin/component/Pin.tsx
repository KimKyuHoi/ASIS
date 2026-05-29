import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

/**
 * Pin to Screen — 캡처 결과(또는 클립보드 이미지)를 떠있는 작은 윈도우로 표시.
 *
 * 동작 (Snipaste 결)
 *   - alwaysOnTop, transparent, frame:false BrowserWindow 안에서 <img> 만 그림.
 *   - 윈도우 영역 자체가 drag — `-webkit-app-region: drag` 지정.
 *   - 닫기 버튼 + ESC / Cmd+W.
 *   - v2 인터랙션:
 *       1/2  : 회전 -90 / +90도
 *       3/4  : 좌우 / 상하 flip
 *       +/-  : 줌 / 축소 (휠 도 동일)
 *       Ctrl+휠 : 투명도
 *       X    : click-through 토글
 */
export default function Pin(): JSX.Element {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageW, setImageW] = useState(0);
  const [imageH, setImageH] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // degrees
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [clickThrough, setClickThrough] = useState(false);

  // main → renderer 핀 데이터 받음.
  useEffect(() => {
    const api = window.pin;
    if (!api) {
      console.error('[asis pin] window.pin 미노출');
      throw new Error('window.pin 미노출 — preload 셋업 확인.');
    }
    // IPC 구독 — teardown 에서 리스너 해제 (Strict Mode 이중 마운트 시 중복 등록 방지).
    const offLoadImage = api.onLoadImage((src, w, h, initialOpacity) => {
      setImageSrc(src);
      setImageW(w);
      setImageH(h);
      setOpacity(initialOpacity);
    });
    api.ready();
    return offLoadImage;
  }, []);

  // 키보드 단축키.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape' || (isMeta && e.code === 'KeyW')) {
        e.preventDefault();
        window.pin.close();
      } else if (e.key === '1') {
        setRotation((r) => r - 90);
      } else if (e.key === '2') {
        setRotation((r) => r + 90);
      } else if (e.key === '3') {
        setFlipX((v) => !v);
      } else if (e.key === '4') {
        setFlipY((v) => !v);
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(z * 1.1, 8));
      } else if (e.key === '-' || e.key === '_') {
        setZoom((z) => Math.max(z / 1.1, 0.1));
      } else if (e.key === '0') {
        setZoom(1);
        setRotation(0);
        setFlipX(false);
        setFlipY(false);
        setOpacity(1);
      } else if (e.code === 'KeyX') {
        setClickThrough((v) => {
          const next = !v;
          window.pin.setClickThrough(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 휠 — Ctrl+휠 = 투명도, 일반 휠 = 줌.
  useEffect(() => {
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // 투명도 — deltaY > 0 → 더 투명, < 0 → 더 진하게.
        setOpacity((o) => {
          const next = e.deltaY > 0 ? o - 0.05 : o + 0.05;
          return Math.min(Math.max(next, 0.15), 1);
        });
      } else {
        setZoom((z) => {
          const next = e.deltaY > 0 ? z / 1.1 : z * 1.1;
          return Math.min(Math.max(next, 0.1), 8);
        });
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  // 줌·회전 변경 시 윈도우 크기 갱신 — 콘텐츠가 정확히 들어가도록.
  useEffect(() => {
    if (!imageW || !imageH) return;
    const isSwapped = Math.abs(rotation % 180) === 90;
    const w = isSwapped ? imageH : imageW;
    const h = isSwapped ? imageW : imageH;
    window.pin.setSize(Math.round(w * zoom), Math.round(h * zoom));
  }, [imageW, imageH, zoom, rotation]);

  if (!imageSrc) {
    return <div style={{ width: 1, height: 1 }} />;
  }

  const transform = [
    `rotate(${rotation}deg)`,
    `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`,
  ].join(' ');

  const containerStyle: CSSProperties = {
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: 'transparent',
    opacity,
    cursor: clickThrough ? 'default' : 'move',
    position: 'relative',
    // 윈도우 자체 drag (Electron) — 닫기 버튼만 no-drag 로.
    WebkitAppRegion: 'drag',
  } as CSSProperties;

  const imgStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    transform,
    transformOrigin: 'center center',
    pointerEvents: 'none',
    userSelect: 'none',
    display: 'block',
  };

  return (
    <div style={containerStyle}>
      <img
        src={imageSrc}
        alt="pinned"
        style={imgStyle}
        draggable={false}
      />
      <CloseButton onClick={(): void => window.pin.close()} />
      {clickThrough ? <ClickThroughBadge /> : null}
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }): JSX.Element {
  // macOS traffic-light 스타일 — 윈도우 *외부* 좌상단에 살짝 걸친 빨간 작은 동그라미.
  // 평소엔 흐릿하게, hover 시 진하게 + × 표시. CSS class 로 hover 처리 (inline 한계).
  return (
    <button
      type="button"
      onClick={onClick}
      className="pin-close"
      aria-label="닫기"
    >
      <span className="pin-close__glyph">×</span>
    </button>
  );
}

function ClickThroughBadge(): JSX.Element {
  const style: CSSProperties = {
    position: 'absolute',
    bottom: 6,
    left: 6,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(0, 0, 0, 0.55)',
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 10,
    pointerEvents: 'none',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
  };
  return <span style={style}>click-through (X 토글)</span>;
}
