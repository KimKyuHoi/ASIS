import { nativeImage } from 'electron';
import type { Frame } from './scrollStitch';
import { UserFacingError } from '../userFacingError';
import { tScroll } from './strings';

/**
 * 스크롤 캡처 프레임 PNG ↔ raw bitmap 변환. scrollStitch.ts 를 electron 무관하게
 * 두려고 nativeImage 의존을 여기로 분리했다.
 *
 * 룰: null-safety.md — 빈 이미지·인코딩 실패는 명시 throw.
 */

/** toBitmap() 은 4채널(macOS 는 BGRA) 고정. */
const CHANNELS = 4;

export function loadFrame(path: string): Frame {
  const img = nativeImage.createFromPath(path);
  if (img.isEmpty()) {
    throw new UserFacingError(tScroll().stitchFailed, `스크롤 캡처: 이미지를 읽지 못함 (빈 이미지): ${path}`);
  }
  const { width, height } = img.getSize();
  const buf = img.toBitmap();
  if (buf.length !== width * height * CHANNELS) {
    throw new UserFacingError(
      tScroll().stitchFailed,
      `스크롤 캡처: bitmap 크기 불일치 (${buf.length} != ${width * height * CHANNELS})`,
    );
  }
  return { width, height, buf };
}

export function encodePng(frame: Frame): Buffer {
  const png = nativeImage
    .createFromBitmap(frame.buf, { width: frame.width, height: frame.height })
    .toPNG();
  if (png.length === 0) {
    throw new UserFacingError(tScroll().stitchFailed, '스크롤 캡처: PNG 인코딩 결과가 비어 있음');
  }
  return png;
}
