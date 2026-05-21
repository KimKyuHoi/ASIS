export function buildMosaicCanvas(
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  blockSize: number,
  // Retina(2x) 등 물리 픽셀 vs 논리 픽셀 비율. img.naturalWidth / imageWidth.
  pixelRatio = 1,
): HTMLCanvasElement {
  const W = Math.max(1, Math.round(Math.abs(w)));
  const H = Math.max(1, Math.round(Math.abs(h)));
  const srcX = w >= 0 ? x : x + w;
  const srcY = h >= 0 ? y : y + h;

  const cols = Math.max(1, Math.ceil(W / blockSize));
  const rows = Math.max(1, Math.ceil(H / blockSize));

  const tiny = document.createElement('canvas');
  tiny.width = cols;
  tiny.height = rows;
  const tinyCtx = tiny.getContext('2d');
  if (tinyCtx) {
    // 논리 픽셀 좌표를 물리 픽셀로 변환해 img의 올바른 영역을 샘플링한다.
    tinyCtx.drawImage(
      img,
      srcX * pixelRatio,
      srcY * pixelRatio,
      W * pixelRatio,
      H * pixelRatio,
      0,
      0,
      cols,
      rows,
    );
  }

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tiny, 0, 0, cols, rows, 0, 0, W, H);
  }
  return out;
}
