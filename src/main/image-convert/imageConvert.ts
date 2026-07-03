import { writeFile } from 'node:fs/promises';
import { nativeImage, type NativeImage } from 'electron';

/**
 * 이미지 포맷·압축 변환 — Electron nativeImage 기반.
 *
 * 목적: 캡처/클립보드 PNG 를 JPG 등으로 재인코딩해 *공유 용량*을 줄인다.
 * PNG 는 무손실이라 스크린샷 용량이 크다. JPG(quality 80) 로 바꾸면 실측상
 * 원본 PNG 의 약 58~61% 크기로 줄어든다 (scratchpad PoC — 아래 주석 참조).
 *
 * 룰
 *   - imperative-style.md — 모듈 순수 함수 + 명령형 OK (React lifecycle 없음).
 *   - null-safety.md — createFromPath 는 실패해도 throw 하지 않고 *빈 이미지*를
 *     반환한다. 그래서 isEmpty() 를 명시 체크하고, 통과하면 안 되는 자리에서
 *     조용히 넘어가지 않고 throw 한다. (?. / ?? / ! 로 얼버무리지 않는다.)
 *
 * 검증(실측, scratchpad PoC — SRC 1920x1080 스크린샷):
 *   - toJPEG(80): 178234B PNG → 107968B (60.6%), 유효 JPEG(FF D8 … FF D9),
 *     재디코드 시 동일 해상도.
 *   - toPNG(): 178234B → 126810B (71.1%) — 재압축만으로도 줄지만 JPG 만큼은 아님.
 *   - toWebP: nativeImage 에 메서드 자체가 없음 → WebP 미지원(아래 한계 참조).
 *
 * 한계
 *   - WebP: nativeImage 는 WebP 인코딩을 제공하지 않는다 (Electron 문서상
 *     인코딩 메서드는 toPNG/toJPEG/toBitmap/toDataURL 뿐). WebP 가 필요하면
 *     ffmpeg-static 로 별도 파이프라인이 필요하다 — 본 모듈 범위 밖.
 *     https://www.electronjs.org/docs/latest/api/native-image
 *   - 알파 손실: JPEG 는 알파 채널이 없다. 반투명/투명 픽셀은 재인코딩 시
 *     검은 배경으로 합성된다 (PoC 확인: 완전투명 픽셀 → 근사 검정). 불투명
 *     스크린샷은 문제 없지만, 창 그림자 알파가 포함된 PNG 를 JPG 로 바꾸면
 *     그림자 주변이 검게 나올 수 있다. PNG 포맷은 알파를 보존한다.
 */

/** 지원 출력 포맷. WebP 는 nativeImage 미지원이라 의도적으로 제외한다. */
export type ImageFormat = 'jpeg' | 'png';

/**
 * 변환 결과 — discriminated union.
 *   - success: 인코딩된 버퍼 + 확장자.
 *   - empty  : 입력 PNG 가 읽히지 않음(빈 이미지). 호출자가 사용자에게 안내.
 */
export type ConvertResult =
  | { kind: 'success'; buffer: Buffer; ext: 'jpg' | 'png' } |
  { kind: 'empty' };

/**
 * JPEG quality 기본값. **0~100 정수** (0.0~1.0 아님).
 * Electron 공식 문서: "quality Integer - Between 0 - 100."
 * https://www.electronjs.org/docs/latest/api/native-image
 * 80 은 용량/품질 균형점 — PoC 에서 원본 PNG 의 약 60% 크기, 육안 손실 미미.
 */
export const DEFAULT_JPEG_QUALITY = 80;

/**
 * PNG 파일 경로를 받아 지정 포맷으로 재인코딩한 버퍼를 반환한다.
 *
 * @param pngPath  screencapture 가 만든 임시 PNG 경로.
 * @param format   출력 포맷 ('jpeg' | 'png').
 * @param quality  JPEG quality (0~100 정수). png 일 때는 무시된다.
 *
 * quality 범위를 벗어난 값의 clamp/throw 여부는 Electron 문서에 명시가 없어
 * (docs-finder 확인) 호출 전에 이 함수에서 명시적으로 범위 검증한다 — 잘못된
 * 스케일(예: 0.8)을 조용히 삼켜 깨진 이미지가 나오는 것을 막는다(null-safety).
 */
export function convertImage(
  pngPath: string,
  format: ImageFormat,
  quality: number = DEFAULT_JPEG_QUALITY,
): ConvertResult {
  const image = nativeImage.createFromPath(pngPath);
  // createFromPath 는 실패 시 throw 하지 않고 빈 이미지를 준다 → 명시 체크.
  if (image.isEmpty()) {
    return { kind: 'empty' };
  }
  return encodeImage(image, format, quality);
}

/**
 * 이미 로드된 NativeImage 를 재인코딩한다 (클립보드 이미지 등 경로가 없는 소스용).
 * 빈 이미지면 { kind: 'empty' }.
 */
export function convertNativeImage(
  image: NativeImage,
  format: ImageFormat,
  quality: number = DEFAULT_JPEG_QUALITY,
): ConvertResult {
  if (image.isEmpty()) {
    return { kind: 'empty' };
  }
  return encodeImage(image, format, quality);
}

/** 포맷별 인코딩 — convertImage / convertNativeImage 공통 코어. */
function encodeImage(
  image: NativeImage,
  format: ImageFormat,
  quality: number,
): ConvertResult {
  if (format === 'png') {
    return { kind: 'success', buffer: image.toPNG(), ext: 'png' };
  }

  // JPEG — quality 는 0~100 정수여야 한다. 아니면 조용히 넘기지 않고 throw.
  if (!Number.isInteger(quality) || quality < 0 || quality > 100) {
    throw new Error(
      `JPEG quality 는 0~100 정수여야 합니다 (받은 값: ${quality}). ` +
        'nativeImage.toJPEG 는 0.0~1.0 이 아니라 0~100 스케일을 씁니다.',
    );
  }
  return { kind: 'success', buffer: image.toJPEG(quality), ext: 'jpg' };
}

/**
 * PNG 를 변환해 파일로 저장한다. 저장 경로는 호출자가 결정(showSaveDialog 등).
 * 빈 이미지면 파일을 쓰지 않고 { kind: 'empty' } 를 그대로 반환한다.
 *
 * @returns 실제로 쓴 결과. 'empty' 면 파일 미생성.
 */
export async function convertImageToFile(
  pngPath: string,
  destPath: string,
  format: ImageFormat,
  quality: number = DEFAULT_JPEG_QUALITY,
): Promise<ConvertResult> {
  const result = convertImage(pngPath, format, quality);
  if (result.kind === 'empty') {
    return result;
  }
  await writeFile(destPath, result.buffer);
  return result;
}
