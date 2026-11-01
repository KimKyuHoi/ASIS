/**
 * main 이 보낸 background 스냅샷을 hidden canvas 에 그리는 순수 함수.
 * SelectionOverlay / RulerOverlay 의 magnifier·color picker 픽셀 source 공용.
 *
 * - raw(BGRA): CGDisplayCreateImage 경로 — PNG 인코딩/디코딩이 아예 없어서
 *   swizzle + putImageData 만으로 즉시 그린다 (레티나 31MB 기준 수십 ms 이내).
 * - dataUrl(PNG): screencapture 폴백 경로 — createImageBitmap 으로 메인 스레드
 *   밖에서 디코딩 후 drawImage.
 */

/** preload 의 BackgroundPayload 와 동일 형태 (contextBridge 로 클론되어 도착). */
export type BackgroundPayload =
  | { kind: 'raw'; data: Uint8Array; width: number; height: number } |
  { kind: 'dataUrl'; dataUrl: string };

export async function paintBackground(
  canvas: HTMLCanvasElement,
  payload: BackgroundPayload,
): Promise<{ w: number; h: number }> {
  if (payload.kind === 'raw') {
    const { data, width, height } = payload;
    const pixelCount = width * height;
    if (data.length < pixelCount * 4) {
      throw new Error(
        `background raw 크기 불일치: ${data.length} < ${width}x${height}x4`,
      );
    }
    // BGRA → RGBA swizzle — uint32 단위(LE): 0xAARRGGBB → 0xAABBGGRR.
    // Uint32Array view 는 4-byte 정렬 필요 — IPC 버퍼가 어긋난 경우만 복사.
    const aligned = data.byteOffset % 4 === 0 ? data : data.slice();
    const src = new Uint32Array(aligned.buffer, aligned.byteOffset, pixelCount);
    const rgba = new Uint8ClampedArray(pixelCount * 4);
    const dst = new Uint32Array(rgba.buffer);
    for (let i = 0; i < pixelCount; i++) {
      const v = src[i];
      dst[i] = (v & 0xff00ff00) | ((v >>> 16) & 0xff) | ((v & 0xff) << 16);
    }
    contextSizedTo(canvas, width, height).putImageData(new ImageData(rgba, width, height), 0, 0);
    return { w: width, h: height };
  }

  const res = await fetch(payload.dataUrl);
  const bmp = await createImageBitmap(await res.blob());
  try {
    contextSizedTo(canvas, bmp.width, bmp.height).drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height };
  } finally {
    bmp.close();
  }
}

/**
 * canvas 를 그릴 이미지 크기로 맞추고 2D 컨텍스트를 반환한다.
 * 크기 변경은 기존 픽셀을 지우므로 그리기 직전에만 호출한다.
 */
function contextSizedTo(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('bgCanvas 2d context 획득 실패');
  ctx.canvas.width = width;
  ctx.canvas.height = height;
  return ctx;
}
