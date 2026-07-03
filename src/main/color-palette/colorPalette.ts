import { nativeImage } from 'electron';

/**
 * 색상 팔레트 추출 — 캡처한 PNG 에서 대표 색 N개를 뽑아 HEX 목록으로 반환한다.
 *
 * sharp/opencv 없이 nativeImage 의 raw bitmap 만으로 순수 처리한다.
 * 알고리즘은 median-cut 색 양자화 — RGB 색 공간을 축 기준으로 재귀 분할해
 * 시각적으로 구분되는 대표색을 뽑는다. 단순 빈도 히스토그램보다 유사색이
 * 하나로 뭉치지 않아 팔레트로서 더 유용하다(실측 결과는 리포트 참고).
 *
 * 채널 순서 (중요)
 *   nativeImage.toBitmap() 의 채널 순서는 Electron 공식 문서상 "platform-dependent"
 *   로만 명시돼 있고 RGBA/BGRA 를 특정하지 않는다. 알려진 단색 PNG(px0=R,px1=G,px2=B)
 *   를 createFromPath → toBitmap 으로 되읽어 실측한 결과 macOS 에서는 BGRA 다
 *   (byte0=B, byte1=G, byte2=R, byte3=A). scrollStitch.ts 는 같은 버퍼를 복사·비교만
 *   해서 순서가 무관했지만, 여기서는 각 채널을 실제 R/G/B 로 해석하므로 BGRA 를 명시한다.
 *   macOS 전용 앱이라 이 상수를 고정한다 — 다른 OS 지원 시 재실측 필요.
 *
 * 알파
 *   screencapture PNG 는 완전 불투명(alpha=255)이라 premultiplied 여부는 실질 무관.
 *   그래도 방어적으로 반투명 픽셀(alpha < 임계)은 대표색 왜곡을 막기 위해 표본에서 제외한다.
 *
 * 룰
 *   - imperative-style.md — 픽셀 루프/버퍼 조작/정렬은 모듈 함수 명령형 OK.
 *   - null-safety.md — 빈 이미지·bitmap 크기 불일치·표본 0개는 명시 throw.
 *   - react-compiler.md — main process 코드라 memo 무관.
 */

/** px 당 바이트 수. nativeImage.toBitmap() 은 4채널 고정. */
const CHANNELS = 4;

/** macOS 실측 채널 오프셋 (BGRA). */
const B_OFFSET = 0;
const G_OFFSET = 1;
const R_OFFSET = 2;
const A_OFFSET = 3;

/** 이 알파 미만 픽셀은 표본에서 제외 — 반투명 픽셀의 색 왜곡 방어. */
const MIN_ALPHA = 125;

/** 다운샘플 목표 표본 수 — 이보다 픽셀이 많으면 균일 간격으로 솎아낸다. */
const DEFAULT_MAX_SAMPLES = 20000;

type Rgb = {
  r: number;
  g: number;
  b: number;
};

export type PaletteColor = {
  /** '#RRGGBB' 대문자. */
  hex: string;
  r: number;
  g: number;
  b: number;
  /** 이 대표색이 대표하는 표본 픽셀 수 — 화면 점유 비중 정렬에 쓴다. */
  count: number;
};

export type PaletteOptions = {
  /** 뽑을 대표색 개수. 기본 6. 표본이 부족하면 그보다 적게 나올 수 있다. */
  colorCount?: number;
  /** 다운샘플 표본 상한. 기본 20000. 클수록 정확·느림. */
  maxSamples?: number;
};

/** 0~255 정수를 2자리 대문자 HEX 로. */
function byteToHex(n: number): string {
  return n.toString(16).padStart(2, '0').toUpperCase();
}

/** R,G,B(0~255)를 '#RRGGBB' 로. 입력은 이미 정수 범위라고 가정한다(내부 호출만). */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
}

/**
 * raw BGRA bitmap 을 균일 간격으로 다운샘플해 Rgb 표본 배열로.
 * 반투명 픽셀(alpha < MIN_ALPHA)은 건너뛴다.
 */
function samplePixels(buf: Buffer, width: number, height: number, maxSamples: number): Rgb[] {
  const total = width * height;
  // 표본이 목표보다 많으면 step 으로 솎고, 적으면 step=1(전부).
  const step = Math.max(1, Math.floor(total / maxSamples));
  const out: Rgb[] = [];
  for (let i = 0; i < total; i += step) {
    const base = i * CHANNELS;
    if (buf[base + A_OFFSET] < MIN_ALPHA) continue;
    out.push({
      r: buf[base + R_OFFSET],
      g: buf[base + G_OFFSET],
      b: buf[base + B_OFFSET],
    });
  }
  return out;
}

type ColorRange = {
  rLen: number;
  gLen: number;
  bLen: number;
};

/** 한 박스(표본 부분집합)의 채널별 값 범위(max-min)를 구한다. */
function boxRange(box: Rgb[]): ColorRange {
  let rMin = 255;
  let rMax = 0;
  let gMin = 255;
  let gMax = 0;
  let bMin = 255;
  let bMax = 0;
  for (const p of box) {
    if (p.r < rMin) rMin = p.r;
    if (p.r > rMax) rMax = p.r;
    if (p.g < gMin) gMin = p.g;
    if (p.g > gMax) gMax = p.g;
    if (p.b < bMin) bMin = p.b;
    if (p.b > bMax) bMax = p.b;
  }
  return { rLen: rMax - rMin, gLen: gMax - gMin, bLen: bMax - bMin };
}

/** 박스의 평균색 + 표본 수를 대표색으로. box 는 비어 있지 않다고 가정(호출부 보장). */
function averageColor(box: Rgb[]): PaletteColor {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of box) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  const k = box.length;
  const ar = Math.round(r / k);
  const ag = Math.round(g / k);
  const ab = Math.round(b / k);
  return { hex: rgbToHex(ar, ag, ab), r: ar, g: ag, b: ab, count: k };
}

/**
 * median-cut 양자화 — 표본을 colorCount 개 박스로 재귀 분할한 뒤 각 박스 평균색을 반환.
 *
 * 매 스텝: 현재 박스들 중 "가장 긴 채널 축"을 가진 박스를 그 축으로 정렬해 중앙에서 둘로 쪼갠다.
 * 더 쪼갤 수 없으면(모든 박스가 1개 이하) 조기 종료 — colorCount 보다 적게 나올 수 있다.
 * 결과는 count(점유 비중) 내림차순.
 */
export function medianCut(pixels: Rgb[], colorCount: number): PaletteColor[] {
  if (pixels.length === 0) {
    // null-safety — 빈 표본을 조용히 빈 배열로 넘기지 않고 원인을 드러낸다.
    throw new Error('색상 팔레트: 유효 표본 픽셀이 0개입니다 (완전 투명 영역일 수 있음)');
  }
  if (colorCount < 1) {
    throw new Error(`색상 팔레트: colorCount 는 1 이상이어야 합니다 (받은 값: ${colorCount})`);
  }

  // 최초 박스 = 전체 표본. 이후 in-place 로 splice 하며 늘려간다.
  const boxes: Rgb[][] = [pixels];

  while (boxes.length < colorCount) {
    // 가장 긴 축을 가진 분할 대상 박스를 찾는다.
    // 제외 조건: (1) 픽셀 2개 미만 — 쪼갤 수 없음. (2) 색 범위 0(모든 픽셀 동일색)
    //   — 쪼개도 같은 색 두 개가 나와 팔레트에 중복이 생긴다. targetLen 시작값을 0 으로
    //   두어 localMax === 0 인 박스는 절대 선택되지 않게 한다.
    let targetIdx = -1;
    let targetAxis: 'r' | 'g' | 'b' = 'r';
    let targetLen = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const range = boxRange(boxes[i]);
      const localMax = Math.max(range.rLen, range.gLen, range.bLen);
      if (localMax > targetLen) {
        targetLen = localMax;
        targetIdx = i;
        targetAxis =
          range.rLen === localMax
            ? 'r'
            : range.gLen === localMax
              ? 'g'
              : 'b';
      }
    }
    // 더 쪼갤 박스가 없으면(전부 단일 색이거나 색 범위 0) 조기 종료.
    if (targetIdx === -1) break;

    const box = boxes[targetIdx];
    box.sort((a, b) => a[targetAxis] - b[targetAxis]);
    const mid = box.length >> 1;
    const left = box.slice(0, mid);
    const right = box.slice(mid);
    // 원 박스를 두 조각으로 교체.
    boxes.splice(targetIdx, 1, left, right);
  }

  const palette = boxes.map(averageColor);
  // 화면 점유가 큰 색이 앞에 오도록 정렬 — 클립보드 목록에서 대표색이 위로.
  palette.sort((a, b) => b.count - a.count);
  return palette;
}

/**
 * PNG 파일 경로에서 대표색 팔레트를 추출한다.
 *
 * @param imagePath 캡처된 PNG 경로.
 * @param opts colorCount(기본 6), maxSamples(기본 20000).
 * @returns 대표색 배열(count 내림차순). 표본 부족 시 colorCount 보다 적을 수 있다.
 * @throws 빈 이미지 / bitmap 크기 불일치 / 유효 표본 0개.
 */
export function extractPalette(imagePath: string, opts: PaletteOptions = {}): PaletteColor[] {
  const colorCount = opts.colorCount ?? 6;
  const maxSamples = opts.maxSamples ?? DEFAULT_MAX_SAMPLES;

  const img = nativeImage.createFromPath(imagePath);
  if (img.isEmpty()) {
    throw new Error(`색상 팔레트: 이미지를 읽지 못함 (빈 이미지): ${imagePath}`);
  }
  const { width, height } = img.getSize();
  const buf = img.toBitmap();
  // toBitmap() 은 width*height*4 를 보장한다(scrollStitch.ts 와 동일 검증). 어긋나면 디코드 이상.
  if (buf.length !== width * height * CHANNELS) {
    throw new Error(
      `색상 팔레트: bitmap 크기 불일치 (${buf.length} != ${width * height * CHANNELS})`,
    );
  }

  const pixels = samplePixels(buf, width, height, maxSamples);
  return medianCut(pixels, colorCount);
}

/**
 * 팔레트를 클립보드에 넣을 텍스트로 — HEX 를 줄바꿈으로 이어붙인다.
 * 예: "#1A2B3C\n#FFAA00\n...". 빈 팔레트는 호출부에서 이미 throw 로 걸러진다고 가정하나,
 * 방어적으로 여기서도 빈 배열이면 throw 한다.
 */
export function paletteToClipboardText(palette: PaletteColor[]): string {
  if (palette.length === 0) {
    throw new Error('색상 팔레트: 클립보드 텍스트로 변환할 대표색이 없습니다');
  }
  return palette.map((c) => c.hex).join('\n');
}
