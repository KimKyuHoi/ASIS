export function buildMosaicCanvas(
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  blockSize: number,
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
    tinyCtx.drawImage(img, srcX, srcY, W, H, 0, 0, cols, rows);
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
