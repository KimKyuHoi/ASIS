import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

/**
 * DRM/HDCP 보호영역(검은 화면) 휴리스틱 감지.
 *
 * 배경
 *   Netflix·Apple TV 등 HDCP 보호 콘텐츠는 스크린 캡처/녹화 시 프레임이 *검게* 찍힌다
 *   (macOS 가 보호 surface 를 캡처 파이프라인에서 검정으로 대체). 우리는 캡처된 프레임
 *   자체를 볼 수 없고 "결과가 검다"는 사실만 관측 가능하므로, ffmpeg signalstats 의
 *   프레임 평균/최대 휘도(YAVG/YMAX)로 "화면 전체가 near-black 인가"를 판정한다.
 *
 * 판정 근거 (실측)
 *   - DRM 보호(순수 검정): YAVG≈16, YMAX≈16 (yuv limited-range black floor=16).
 *   - 다크모드 IDE(0x111111): YAVG≈31, YMAX≈31 — 위험한 오탐 경계.
 *   - 레터박스 영상(위아래 검정 + 중앙 밝음): YAVG≈137, *YMAX≈235* — 밝은 픽셀 존재.
 *   - 일반 화면: YAVG≈229, YMAX≈255.
 *   → 핵심 판별자는 YAVG 단독이 아니라 **YMAX**(프레임 어디에도 밝은 픽셀이 없는가).
 *     레터박스처럼 일부만 검은 화면은 YMAX 가 높아 걸러진다.
 *
 * 한계 (정직 고지 — 완벽하지 않은 휴리스틱)
 *   - *진짜로* 전체가 검은 정상 화면(검은 배경화면, 화면보호기, 잠자기 직전, 어두운
 *     풀스크린 씬)은 DRM 과 구분할 수 없어 오탐(false positive)한다.
 *   - HDCP 가 아닌데 콘텐츠가 어두운 다크모드(YAVG≈31) 는 임계값 위라 통과하지만,
 *     임계값 근처라 콘텐츠에 따라 흔들릴 수 있다.
 *   - "보호됨"을 *단정* 하지 않고 "보호영역일 수 있음(near-black)"으로 알리는 용도.
 *
 * ocr.ts 와 동형의 순수 모듈 함수 — lifecycle 없음(side-effects.md: Class 아님).
 * signalstats 값은 stdout 으로 나오므로(runProcess 는 stderr 만 모아 부적합) 직접 spawn.
 */

if (!ffmpegPath) {
  throw new Error('ffmpeg-static path 가 null — 설치 안 됐거나 platform 미지원');
}
// electron-builder 가 app.asar 안 바이너리를 spawn 할 수 없어 unpacked 경로로 교정
// (screenRecord.ts / gif.ts 와 동일).
const FFMPEG_BIN = ffmpegPath.replace('app.asar', 'app.asar.unpacked');

/**
 * near-black 판정 임계값 (yuv luma 0~255, limited-range 기준 검정=16).
 *   - YMAX ≤ MAX_LUMA_THRESHOLD: 프레임 어디에도 이보다 밝은 픽셀이 없다.
 *   - YAVG ≤ AVG_LUMA_THRESHOLD: 평균도 near-black.
 * 다크모드(≈31) 를 통과시키되 DRM(≈16) 을 잡도록 24 로 둔다(실측 마진).
 */
const MAX_LUMA_THRESHOLD = 24;
const AVG_LUMA_THRESHOLD = 24;

/**
 * DRM 판정 결과. discriminated union (`| {...} |` 스타일).
 *   - protected: 화면 전체가 near-black — DRM/HDCP 보호영역일 가능성.
 *   - clear:     밝은 픽셀이 존재 — 보호영역 아님.
 * 두 경우 모두 측정값(yavg/ymax)을 실어 호출자가 로그·튜닝에 쓸 수 있게 한다.
 */
export type DrmProbeResult =
  | { kind: 'protected'; yavg: number; ymax: number } |
  { kind: 'clear'; yavg: number; ymax: number };

/**
 * 비디오/이미지 파일의 프레임 휘도를 측정해 near-black(보호영역 의심) 여부 반환.
 *
 * 여러 프레임이 있으면 *가장 밝은* 프레임 기준으로 판정한다 — 구간 중 한 프레임이라도
 * 밝으면 보호영역이 아니라고 보수적으로 본다(오탐 최소화).
 *
 * @param filePath 검사할 .mp4/.mov/.png 등 ffmpeg 가 읽는 미디어 경로.
 */
export function probeProtectedContent(filePath: string): Promise<DrmProbeResult> {
  return new Promise<DrmProbeResult>((resolve, reject) => {
    // signalstats 는 프레임별 lavfi.signalstats.YAVG/YMAX 를 metadata 로 stdout 출력.
    // -f null - : 실제 인코딩 없이 필터만 통과시켜 값만 뽑는다.
    const child = spawn(FFMPEG_BIN, [
      '-hide_banner',
      '-i',
      filePath,
      '-vf',
      'signalstats,metadata=print:file=-',
      '-f',
      'null',
      '-',
    ]);
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;

    if (!child.stdout || !child.stderr) {
      // null-safety — non-null assertion 대신 명시 체크.
      settled = true;
      reject(new Error('ffmpeg signalstats: stdout/stderr 스트림이 없음'));
      return;
    }

    child.stdout.on('data', (c: Buffer) => outChunks.push(c));
    child.stderr.on('data', (c: Buffer) => errChunks.push(c));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`DRM 감지 spawn 실패: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf8').trim();
        reject(new Error(`DRM 감지 실패 (exit ${code ?? 'null'}): ${stderr}`));
        return;
      }
      const stdout = Buffer.concat(outChunks).toString('utf8');
      const stats = parseLumaStats(stdout);
      if (!stats) {
        // signalstats 값이 하나도 안 나옴 = 프레임 없음/필터 미동작. silent 통과 금지.
        reject(new Error('DRM 감지 실패: signalstats 휘도 값을 얻지 못함'));
        return;
      }
      const protectedContent =
        stats.ymax <= MAX_LUMA_THRESHOLD && stats.yavg <= AVG_LUMA_THRESHOLD;
      resolve(
        protectedContent
          ? { kind: 'protected', yavg: stats.yavg, ymax: stats.ymax }
          : { kind: 'clear', yavg: stats.yavg, ymax: stats.ymax },
      );
    });
  });
}

/**
 * signalstats stdout 에서 프레임들의 YAVG/YMAX 를 파싱해
 * "가장 밝은 프레임"의 값(최대 YAVG, 최대 YMAX)을 반환. 값이 없으면 null.
 *
 * 출력 예 (프레임당 블록):
 *   frame:0    pts:0       pts_time:0
 *   lavfi.signalstats.YMIN=16
 *   lavfi.signalstats.YAVG=16
 *   lavfi.signalstats.YMAX=16
 */
function parseLumaStats(
  stdout: string,
): { yavg: number; ymax: number } | null {
  let maxYavg = -1;
  let maxYmax = -1;
  for (const line of stdout.split('\n')) {
    const avg = line.match(/lavfi\.signalstats\.YAVG=([0-9.]+)/);
    if (avg) {
      const v = Number(avg[1]);
      if (v > maxYavg) maxYavg = v;
    }
    const max = line.match(/lavfi\.signalstats\.YMAX=([0-9.]+)/);
    if (max) {
      const v = Number(max[1]);
      if (v > maxYmax) maxYmax = v;
    }
  }
  if (maxYavg < 0 || maxYmax < 0) return null;
  return { yavg: maxYavg, ymax: maxYmax };
}
