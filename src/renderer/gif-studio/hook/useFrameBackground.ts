import { useEffect, type RefObject } from 'react';
import { useEditorStore } from '../../editor/lib/store';
import { CaptureSuperseded, cancelLatest, captureLatest } from '../lib/frame-capture';
import { frameKey, frameSampleTime, type FrameGrid } from '../lib/frame-grid';

/**
 * 편집 중인 프레임의 정지화면을 에디터 배경(imageSrc)으로 — 프레임이 바뀔 때마다.
 * 재생 중에는 캡처하지 않는다 (video 가 재생 위치를 쥐고 있다).
 * <video> 는 DOM 상태라 effect 로 맞춘다. 밀린 요청은 캡처 큐에서 버리고(captureLatest),
 * 늦게 끝난 이전 캡처 결과도 버린다.
 */
export function useFrameBackground(
  videoRef: RefObject<HTMLVideoElement | null>,
  frame: { grid: FrameGrid; current: number },
  playing: boolean,
): void {
  const { grid, current } = frame;
  useEffect(() => {
    if (playing) return undefined;
    const video = videoRef.current;
    if (!video) throw new Error('GIF 스튜디오 — video 요소가 없다.');
    let active = true;
    captureLatest(video, frameSampleTime(grid, current), frameKey(grid, current)).then((url) => {
      if (active) useEditorStore.setState({ imageSrc: url });
    }).catch((err: unknown) => {
      // 트림 드래그·키 반복으로 더 새 프레임을 요청해 밀려난 캡처 — 정상.
      if (err instanceof CaptureSuperseded) return;
      console.error('[asis gif-studio] 프레임 정지화면 캡처 실패', err);
    });
    return () => {
      active = false;
      // 아직 시작 못 한 캡처는 버린다 (재생 시작·프레임 연타 직후에 영상을 멈추지 않게).
      cancelLatest();
    };
  }, [videoRef, grid, current, playing]);
}
