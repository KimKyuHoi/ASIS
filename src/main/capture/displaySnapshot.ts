import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { screen, type BrowserWindow } from 'electron';
import koffi from 'koffi';
import log from 'electron-log/main';

/**
 * Selection/Ruler 오버레이의 Magnifier/Color-picker 용 background 스냅샷.
 *
 * 1차 경로: CGDisplayCreateImage (in-process FFI) — spawn·PNG 인코딩·base64 가
 *   전부 없어서 실측 ~20ms (screencapture spawn 은 ~100ms). raw BGRA 픽셀을
 *   그대로 renderer 에 보내고, renderer 가 RGBA 로 스위즐해 canvas 에 그린다.
 *   macOS 15+ deprecated API 지만 macOS 26(Darwin 25) 에서 실동작을 검증했다
 *   (3개 디스플레이 모두 OK, 색상 정확). 향후 제거되면 폴백이 자동으로 받는다.
 *
 * 폴백 경로: /usr/sbin/screencapture -R spawn → PNG dataURL — CG 바인딩 실패,
 *   NULL 반환(권한/디스플레이 sleep), 예상 밖 픽셀 포맷일 때.
 *
 * 룰
 *   - side-effects.md — lifecycle 없는 순수 캡처 → 모듈 함수 (windowsInfo 와 동일 결).
 *   - null-safety.md — CG NULL/포맷 불일치는 명시 분기 후 폴백. 빈 catch 없음.
 */

const CHANNEL_BACKGROUND = 'capture:background';

export type BackgroundPayload =
  | { kind: 'raw'; data: Buffer; width: number; height: number } |
  { kind: 'dataUrl'; dataUrl: string };

type Bounds = { x: number; y: number; width: number; height: number };

// ---------------------------------------------------------------------------
// CoreGraphics 바인딩 — lazy init (koffi.load 는 dlopen, 한 번만)
// ---------------------------------------------------------------------------
type CgFns = {
  createImage: koffi.KoffiFunction;
  getWidth: koffi.KoffiFunction;
  getHeight: koffi.KoffiFunction;
  getBytesPerRow: koffi.KoffiFunction;
  getBitmapInfo: koffi.KoffiFunction;
  getDataProvider: koffi.KoffiFunction;
  copyData: koffi.KoffiFunction;
  dataLength: koffi.KoffiFunction;
  dataBytePtr: koffi.KoffiFunction;
  release: koffi.KoffiFunction;
};

/** undefined = 미시도, null = 초기화 실패(이후 폴백 고정). */
let _cg: CgFns | null | undefined;

function getCg(): CgFns | null {
  if (_cg !== undefined) return _cg;
  try {
    // windowsInfo 의 'CfRef' 이름과 충돌하지 않도록 anonymous 포인터 타입 사용.
    const ref = koffi.pointer(koffi.opaque());
    const CG = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
    const CF = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
    _cg = {
      createImage: CG.func('CGDisplayCreateImage', ref, ['uint32']),
      getWidth: CG.func('CGImageGetWidth', 'ulong', [ref]),
      getHeight: CG.func('CGImageGetHeight', 'ulong', [ref]),
      getBytesPerRow: CG.func('CGImageGetBytesPerRow', 'ulong', [ref]),
      getBitmapInfo: CG.func('CGImageGetBitmapInfo', 'uint32', [ref]),
      getDataProvider: CG.func('CGImageGetDataProvider', ref, [ref]),
      copyData: CG.func('CGDataProviderCopyData', ref, [ref]),
      dataLength: CF.func('CFDataGetLength', 'long', [ref]),
      dataBytePtr: CF.func('CFDataGetBytePtr', koffi.pointer('uint8'), [ref]),
      release: CF.func('CFRelease', 'void', [ref]),
    };
  } catch (err) {
    console.warn('[asis] CoreGraphics 바인딩 실패 — screencapture 폴백 사용:', err);
    _cg = null;
  }
  return _cg;
}

// CGBitmapInfo 마스크 — renderer 스위즐이 BGRA(32Little + alpha first) 가정이라
// 그 외 포맷이면 폴백으로 보낸다.
const kCGBitmapByteOrderMask = 0x7000;
const kCGBitmapByteOrder32Little = 0x2000;
const kCGBitmapAlphaInfoMask = 0x1f;
const kCGImageAlphaPremultipliedFirst = 2;
const kCGImageAlphaNoneSkipFirst = 6;

/** 예상 밖 픽셀 포맷 경고는 한 번만 — 폴백이 매번 돌며 로그를 도배하지 않도록. */
let formatWarned = false;

/**
 * CGDisplayCreateImage 로 디스플레이 전체를 raw BGRA 로 캡처.
 * 실패(NULL/포맷 불일치)는 null — 호출측이 screencapture 로 폴백한다.
 * capture 호출은 koffi .async 로 워커 스레드에서 실행 — main 이벤트 루프 비차단.
 */
async function captureDisplayRaw(
  displayId: number,
): Promise<{ data: Buffer; width: number; height: number } | null> {
  const cg = getCg();
  if (!cg) return null;

  const img = await new Promise<unknown>((resolve, reject) => {
    cg.createImage.async(displayId, (err: unknown, res: unknown) => {
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve(res);
    });
  });
  // NULL = 권한 없음, 디스플레이 sleep, 미래 macOS 의 API 제거 등 — 폴백 경로.
  if (!img) return null;

  try {
    const width = Number(cg.getWidth(img));
    const height = Number(cg.getHeight(img));
    const bytesPerRow = Number(cg.getBytesPerRow(img));
    const info = Number(cg.getBitmapInfo(img));
    const isBgra =
      (info & kCGBitmapByteOrderMask) === kCGBitmapByteOrder32Little &&
      ((info & kCGBitmapAlphaInfoMask) === kCGImageAlphaPremultipliedFirst ||
        (info & kCGBitmapAlphaInfoMask) === kCGImageAlphaNoneSkipFirst);
    if (width <= 0 || height <= 0 || !isBgra) {
      if (!formatWarned) {
        formatWarned = true;
        console.warn(
          `[asis] CGImage 예상 밖 포맷 (bitmapInfo=0x${info.toString(16)}, ${width}x${height}) — screencapture 폴백`,
        );
      }
      return null;
    }

    const data = cg.copyData(cg.getDataProvider(img));
    if (!data) return null;
    try {
      const len = Number(cg.dataLength(data));
      const ptr = cg.dataBytePtr(data);
      const full = Buffer.from(koffi.decode(ptr, koffi.array('uint8', len)) as Uint8Array);
      const rowBytes = width * 4;
      if (bytesPerRow === rowBytes) {
        return { data: full, width, height };
      }
      // stride 패딩 제거 — renderer 의 ImageData 는 촘촘한 rowBytes 를 기대한다.
      const packed = Buffer.allocUnsafe(rowBytes * height);
      for (let y = 0; y < height; y++) {
        full.copy(packed, y * rowBytes, y * bytesPerRow, y * bytesPerRow + rowBytes);
      }
      return { data: packed, width, height };
    } finally {
      cg.release(data);
    }
  } finally {
    cg.release(img);
  }
}

// ---------------------------------------------------------------------------
// 폴백 — screencapture spawn (기존 selectionOverlay/rulerOverlay 로직 통합)
// ---------------------------------------------------------------------------
async function captureWithScreencapture(bounds: Bounds): Promise<string> {
  const tmpPath = join(tmpdir(), `asis-bg-${Date.now()}-${process.pid}.png`);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('/usr/sbin/screencapture', [
        '-x',
        '-R',
        `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`,
        '-t',
        'png',
        tmpPath,
      ]);
      // screencapture 가 hang 하는 극단 케이스에서 process leak 방지.
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('screencapture timeout (5s)'));
      }, 5000);
      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`screencapture exit ${code}`));
      });
    });
    const buf = await readFile(tmpPath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } finally {
    // 실패 시에도 부분 생성 PNG 정리. ENOENT 는 정상 (파일 미생성).
    await unlink(tmpPath).catch((err: unknown) => {
      if (!isFileNotFound(err)) console.warn('[asis] background tmp cleanup failed', err);
    });
  }
}

function isFileNotFound(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------
/**
 * 앱 시작 시 호출 — CG 경로의 lazy 초기화(dlopen + 프레임워크 로드 + 첫 캡처의
 * WindowServer 연결)를 미리 치러 둔다. 실측: 첫 호출 ~80ms → 이후 ~20ms.
 * whenReady 이후에만 호출할 것 (screen 모듈 사용).
 */
export function warmDisplaySnapshot(): void {
  captureDisplayRaw(screen.getPrimaryDisplay().id).catch(() => {
    // warm-up 실패는 첫 캡처가 조금 느려질 뿐 — 실제 경로가 폴백까지 처리한다.
  });
}

/**
 * 디스플레이 background 를 캡처해 CHANNEL_BACKGROUND 로 전송.
 * 실패 시 reject — 호출측이 "magnifier 비활성" 로 처리한다.
 */
export async function sendBackgroundSnapshot(
  win: BrowserWindow,
  display: { id: number; bounds: Bounds },
  logPerf = false,
): Promise<void> {
  const startedAt = Date.now();

  let raw: Awaited<ReturnType<typeof captureDisplayRaw>> = null;
  try {
    raw = await captureDisplayRaw(display.id);
  } catch (err) {
    console.warn('[asis] CGDisplayCreateImage 실패 — screencapture 폴백:', err);
  }

  if (raw) {
    if (!win.isDestroyed()) {
      const payload: BackgroundPayload = { kind: 'raw', ...raw };
      win.webContents.send(CHANNEL_BACKGROUND, payload);
    }
    if (logPerf) {
      log.info(
        `[perf] bg(cg) ${Date.now() - startedAt}ms ${raw.width}x${raw.height}` +
        ` (raw ${Math.round(raw.data.length / 1048576)}MB)`,
      );
    }
    return;
  }

  const dataUrl = await captureWithScreencapture(display.bounds);
  if (!win.isDestroyed()) {
    const payload: BackgroundPayload = { kind: 'dataUrl', dataUrl };
    win.webContents.send(CHANNEL_BACKGROUND, payload);
  }
  if (logPerf) {
    log.info(`[perf] bg(sc-fallback) ${Date.now() - startedAt}ms`);
  }
}
