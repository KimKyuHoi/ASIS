import { useEffect, useState, type RefObject } from 'react';
import { setPlayhead } from '../lib/playhead';

function requireVideo(ref: RefObject<HTMLVideoElement | null>): HTMLVideoElement {
  const video = ref.current;
  if (!video) throw new Error('GIF 스튜디오 — video 요소가 없다.');
  return video;
}

/**
 * 트림 구간 반복 재생 — <video> 는 DOM 상태라 effect 로 맞춘다.
 *  - 처음엔 멈춘 상태(프레임 편집)로 연다. 재생은 주석을 움직이며 확인하는 용도.
 *  - speed: 출력 속도와 같은 배속으로 미리보기
 *  - 재생 중 매 프레임 구간 끝을 넘었는지 보고 시작점으로 되감는다. timeupdate(≈4Hz)
 *    로는 끝을 최대 250ms 넘겨 잘린 구간 밖 프레임이 보인다.
 */
export function usePlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  range: { start: number; end: number; speed: number },
): {
  playing: boolean;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  onEnded: () => void;
} {
  const { start, end, speed } = range;
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = requireVideo(videoRef);
    // load 알고리즘이 playbackRate 를 defaultPlaybackRate 로 되돌리므로 둘 다 맞춘다.
    video.defaultPlaybackRate = speed;
    video.playbackRate = speed;
  }, [speed, videoRef]);

  useEffect(() => {
    const video = requireVideo(videoRef);
    if (!playing) {
      video.pause();
      return;
    }
    video.play().catch((err: unknown) => {
      // 미디어 교체 직후의 pause() 경합(AbortError)은 다음 play 로 회복된다.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[asis gif-studio] video.play 실패', err);
    });
  }, [playing, videoRef]);

  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    const tick = (): void => {
      const video = requireVideo(videoRef);
      if (video.currentTime >= end || video.currentTime < start) video.currentTime = start;
      setPlayhead(video.currentTime);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, start, end, videoRef]);

  const seek = (time: number): void => {
    requireVideo(videoRef).currentTime = time;
    setPlayhead(time);
  };

  // 구간 끝이 영상 끝과 같으면 rAF 보다 ended 가 먼저 올 수 있다 — 되감아 계속 재생.
  const onEnded = (): void => {
    if (!playing) return;
    const video = requireVideo(videoRef);
    video.currentTime = start;
    video.play().catch((err: unknown) => {
      console.error('[asis gif-studio] 재생 반복 실패', err);
    });
  };

  return {
    playing,
    play: (): void => setPlaying(true),
    pause: (): void => setPlaying(false),
    seek,
    onEnded,
  };
}
