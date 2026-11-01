/**
 * JPEG EXIF Orientation(0x0112) 읽기 — 1~8, 태그가 없거나 읽을 수 없으면 1(회전 없음).
 *
 * 왜 필요한가: Chromium <img> 는 EXIF 회전을 적용해 그리지만(naturalWidth/Height 도 회전 후 값)
 * nativeImage.getSize() 는 회전 전 크기를 준다 (Electron 39 실측: Orientation=6 JPEG →
 * nativeImage 400×300, Chromium 300×400). 에디터 논리 크기는 Chromium 이 보는 쪽과 맞아야
 * export 배율·비율이 맞는다.
 *
 * 구조: SOI 뒤 세그먼트를 따라가다 APP1 'Exif\0\0' → TIFF 헤더(II/MM) → IFD0 항목 중 0x0112.
 * SOS(이미지 데이터 시작)를 만나거나 범위를 벗어나면 1.
 */
export function readJpegOrientation(buf: Buffer): number {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= buf.length && buf[offset] === 0xff) {
    const marker = buf[offset + 1];
    if (marker === 0xda || marker === 0xd9) return 1;
    const length = buf.readUInt16BE(offset + 2);
    if (marker === 0xe1) {
      const found = orientationInApp1(buf, offset + 4, offset + 2 + length);
      if (found !== null) return found;
    }
    offset += 2 + length;
  }
  return 1;
}

function orientationInApp1(buf: Buffer, start: number, end: number): number | null {
  if (end > buf.length || buf.toString('latin1', start, start + 6) !== 'Exif\0\0') return null;
  const tiff = start + 6;
  // TIFF 헤더(바이트 순서 2 + 매직 2 + IFD0 오프셋 4)가 세그먼트 안에 다 있어야 읽는다.
  if (tiff + 8 > end) return null;
  const order = buf.toString('latin1', tiff, tiff + 2);
  if (order !== 'II' && order !== 'MM') return null;
  const le = order === 'II';
  const u16 = (at: number): number => (le ? buf.readUInt16LE(at) : buf.readUInt16BE(at));
  const u32 = (at: number): number => (le ? buf.readUInt32LE(at) : buf.readUInt32BE(at));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return null;
}

/** 5~8 은 90°/270° 계열 — 화면에 그려지는 가로·세로가 저장된 픽셀과 뒤바뀐다. */
export function swapsAxes(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}
