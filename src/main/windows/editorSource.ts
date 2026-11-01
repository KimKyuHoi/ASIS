import { nativeImage, screen } from 'electron';
import { readFileSync } from 'node:fs';
import type { EditorProjectData } from '../../shared/editor-project';

/**
 * 에디터 세션의 배경 준비 — 출처(캡처 tmp·히스토리 편집본·이미지 파일)를 renderer 로 보낼
 * data URL + 논리 크기로 바꾼다. editorWindow.ts 가 길어져 분리했다.
 */

/**
 * 세션의 출처.
 *  - capture: 새 캡처(tmp 파일 — 세션이 끝나면 지운다)
 *  - project: 히스토리 [편집]의 편집본
 *  - image:   이미지 스튜디오 — 이미 읽은 사용자 파일 (지우지 않는다)
 */
export type SessionSource =
  | { kind: 'capture'; path: string } |
  { kind: 'project'; project: EditorProjectData } |
  { kind: 'image'; loaded: LoadedCapture };

export type LoadedCapture = {
  /** renderer Stage 가 쓰는 논리 크기 (소수 가능 — loadCapture 주석 참고). */
  logW: number;
  logH: number;
  dataUrl: string;
};

export function loadSource(source: SessionSource): LoadedCapture {
  switch (source.kind) {
    case 'capture': return loadCapture(source.path);
    // 형식 검증은 히스토리에 기록할 때 끝났다(captureHistory.checkedProject).
    case 'project': {
      const { dataUrl, width, height } = source.project.image;
      return { logW: width, logH: height, dataUrl };
    }
    case 'image': return source.loaded;
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

/**
 * 물리 픽셀 크기 → 에디터 논리 크기. 캡처와 이미지 스튜디오가 같은 규칙을 쓴다 —
 * 주 디스플레이 배율로 나눈다(반올림 안 함 — loadCapture 주석). export 는 renderer 가
 * naturalWidth / 논리 크기로 원본 픽셀을 복원하므로 해상도는 그대로다.
 */
export function toLoaded(dataUrl: string, imgW: number, imgH: number): LoadedCapture {
  const sf = screen.getPrimaryDisplay().scaleFactor || 1;
  return { logW: imgW / sf, logH: imgH / sf, dataUrl };
}

/**
 * 캡처 PNG 를 읽어 renderer 로 보낼 data URL 과 크기를 만든다. 읽기 실패는 throw.
 *
 * data URL 인 이유 — dev 에서 renderer 가 http(dev 서버) 페이지로 뜨면 Chromium 이
 * file:// 이미지를 차단하고, 커스텀 프로토콜은 cross-origin canvas taint 로
 * toDataURL(복사/저장)을 깨뜨린다. data: 는 어느 출처에서도 로드·export 안전.
 * 원본 바이트 그대로 base64 (재인코딩 없음).
 */
function loadCapture(imagePath: string): LoadedCapture {
  const image = nativeImage.createFromPath(imagePath);
  if (image.isEmpty()) {
    throw new Error(`editor: empty image at ${imagePath}`);
  }
  const { width: imgW, height: imgH } = image.getSize();
  // screencapture 는 Retina(2x) 해상도로 저장 → imgW/imgH 는 물리 픽셀.
  // BrowserWindow.setSize 와 renderer Stage 는 논리 픽셀(CSS px) 기준이므로
  // scaleFactor 로 나눠서 논리 픽셀로 변환한다.
  // 반올림하지 않는다 — 홀수 픽셀(1001px 등)을 501 로 올리면 renderer 의 export 배율이
  // 1001/501≈1.998 이 되어 원본이 리샘플링(흐림)되고 세로는 1px 늘어난다(실측).
  // 소수 논리 크기(500.5)여야 배율이 정확히 sf 로 맞아 원본 픽셀 그대로 export 된다.
  // (주 디스플레이 배율이 캡처된 디스플레이와 달라도 export 는 renderer 가
  //  bgImage.naturalWidth / logW 로 원본 픽셀을 복원하므로 해상도는 유지된다.)
  let base64: string;
  try {
    base64 = readFileSync(imagePath).toString('base64');
  } catch (err) {
    // createFromPath 성공 직후라 정상적으론 불가능 — 파일이 그 사이 사라진 race.
    throw new Error(
      `editor: capture read failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return toLoaded(`data:image/png;base64,${base64}`, imgW, imgH);
}
