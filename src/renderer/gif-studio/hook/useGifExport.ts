import { useRef, useState, type RefObject } from 'react';
import type {
  GifExportOptions,
  GifExportTarget,
  GifOverlayTrack,
} from '../../../main/gif-studio/types';
import { useEditorStore } from '../../editor/lib/store';
import { captureFrame } from '../lib/frame-capture';
import { exportFrameShapes, getFrames, markSaved } from '../lib/frame-docs';
import { frameKey, frameSampleTime } from '../lib/frame-grid';
import { errorMessage } from '../lib/format-media';
import { buildOverlayTrack } from '../lib/overlay-track';

export type ExportNotice =
  | { kind: 'saved'; path: string } |
  { kind: 'copied'; size: number } |
  { kind: 'error'; message: string };

export type ExportBusy = { target: GifExportTarget; done: number; total: number };

/** 주석을 굽는 도중 [취소] — main 에 내보내기가 아직 없으므로 렌더러에서 멈춘다. */
class BakeCanceled extends Error {
  constructor() {
    super('주석 굽기 취소');
    this.name = 'BakeCanceled';
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => resolve(img);
    img.onerror = (): void => reject(new Error('GIF 스튜디오 — 프레임 정지화면 디코딩 실패'));
    img.src = url;
  });
}

/**
 * 내보내기 실행 — 프레임마다 주석을 투명 PNG 로 굽고(lib/overlay-track) main 에 ffmpeg 합성을
 * 요청한다. 진행 상태(busy: 구운 장 수)와 결과 알림(notice)을 소유한다.
 * 블러·모자이크 프레임의 배경은 video 로 떠야 해서, 부르는 쪽이 재생을 멈춘 뒤 부른다.
 */
export function useGifExport(
  videoRef: RefObject<HTMLVideoElement | null>,
  mediaPath: string,
): {
  busy: ExportBusy | null;
  notice: ExportNotice | null;
  setNotice: (n: ExportNotice | null) => void;
  run: (target: GifExportTarget, options: GifExportOptions) => void;
  cancel: () => void;
} {
  const [busy, setBusy] = useState<ExportBusy | null>(null);
  const [notice, setNotice] = useState<ExportNotice | null>(null);
  const canceledRef = useRef(false);

  const bake = async (target: GifExportTarget): Promise<GifOverlayTrack | null> => {
    const video = videoRef.current;
    if (!video) throw new Error('GIF 스튜디오 — video 요소가 없다.');
    const { grid } = getFrames();
    const { imageWidth, imageHeight } = useEditorStore.getState();
    return buildOverlayTrack({
      grid,
      frames: exportFrameShapes(),
      size: { width: imageWidth, height: imageHeight },
      background: async (k) => {
        const url = await captureFrame(video, frameSampleTime(grid, k), frameKey(grid, k));
        return loadImage(url);
      },
      onProgress: (done, total) => {
        if (canceledRef.current) throw new BakeCanceled();
        setBusy({ target, done, total });
      },
    });
  };

  const send = async (target: GifExportTarget, options: GifExportOptions): Promise<void> => {
    try {
      const overlay = await bake(target);
      if (canceledRef.current) return;
      const result = await window.gifStudio.export({ mediaPath, options, overlay, target });
      if (result.kind !== 'canceled') markSaved();
      if (result.kind === 'saved') setNotice({ kind: 'saved', path: result.path });
      if (result.kind === 'copied') setNotice({ kind: 'copied', size: result.size });
      // canceled — 사용자가 다이얼로그/진행을 취소. 알릴 것 없음.
    } catch (err) {
      if (err instanceof BakeCanceled) return;
      // 오버레이 굽기 실패도 여기로 — busy 모달이 남지 않게 항상 알림으로 끝낸다.
      console.error('[asis gif-studio] 내보내기 실패', err);
      setNotice({ kind: 'error', message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const run = (target: GifExportTarget, options: GifExportOptions): void => {
    canceledRef.current = false;
    setBusy({ target, done: 0, total: 0 });
    setNotice(null);
    // setBusy 가 모달을 먼저 그리게 한 틱 양보한다 (rAF 는 창이 가려지면 멈춰서 쓰지 않는다).
    window.setTimeout(() => {
      send(target, options).catch((err: unknown) => {
        console.error('[asis gif-studio] 내보내기 처리 중 예외', err);
      });
    }, 0);
  };

  const cancel = (): void => {
    canceledRef.current = true;
    window.gifStudio.cancelExport().catch((err: unknown) => {
      setNotice({ kind: 'error', message: errorMessage(err) });
    });
  };

  return { busy, notice, setNotice, run, cancel };
}
