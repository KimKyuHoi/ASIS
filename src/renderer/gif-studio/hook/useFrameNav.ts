import { commitEditor, getFrames, gotoFrame } from '../lib/frame-docs';
import { frameAt, frameCenter, frameShownAt } from '../lib/frame-grid';
import { getPlayhead, setPlayhead } from '../lib/playhead';

type Playback = {
  playing: boolean;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
};

export type FrameNav = {
  playing: boolean;
  togglePlay: () => void;
  /** 재생 중이면 멈추고 프레임 k 를 편집한다. */
  goTo: (k: number) => void;
  step: (delta: 1 | -1) => void;
  /** 트림 바에서 시각을 고른 경우 — 그 시각의 프레임으로. */
  seekTime: (t: number) => void;
};

/**
 * 재생 ↔ 프레임 편집 전환. 멈추면 재생 위치의 프레임을 편집하고, 재생하면 편집 중이던
 * 프레임부터 보여 준다. 프레임 정지화면은 hook/useFrameBackground 가 그 프레임으로 맞춘다.
 */
export function useFrameNav(playback: Playback): FrameNav {
  const goTo = (k: number): void => {
    if (playback.playing) playback.pause();
    gotoFrame(k);
    const { grid, current } = getFrames();
    setPlayhead(frameCenter(grid, current));
  };

  const togglePlay = (): void => {
    const { grid, current } = getFrames();
    if (playback.playing) {
      playback.pause();
      // 재생 미리보기(PlaybackOverlay)와 같은 규칙 — 방금 보이던 주석의 프레임을 연다.
      goTo(frameShownAt(grid, getPlayhead()));
      return;
    }
    // 편집 중이던 내용을 문서로 보관해야 재생 미리보기에 보인다.
    commitEditor();
    playback.seek(frameCenter(grid, current));
    playback.play();
  };

  return {
    playing: playback.playing,
    togglePlay,
    goTo,
    step: (delta): void => goTo(getFrames().current + delta),
    seekTime: (t): void => goTo(frameAt(getFrames().grid, t)),
  };
}
