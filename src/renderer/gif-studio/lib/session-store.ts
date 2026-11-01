import type { GifStudioMedia } from '../../../main/gif-studio/types';
import { useEditorStore } from '../../editor/lib/store';
import { errorMessage } from './format-media';
import { clearFrameCache } from './frame-capture';
import { installFramesSync, resetFrames } from './frame-docs';
import { makeGrid } from './frame-grid';
import { defaultSettings } from './export-settings';

/**
 * GIF 스튜디오 창의 "지금 열린 미디어 + 미리보기 자원" — 모듈 스코프 외부 store.
 *
 * side-effects.md — main 이 push 하는 IPC 상태라 React 는 useSyncExternalStore
 * (hook/useStudioSession.ts) 로만 읽는다. Blob URL 생성·해제도 여기서만 한다.
 */
export type StudioSession =
  | { status: 'empty' } |
  { status: 'loading'; media: GifStudioMedia } |
  {
    status: 'ready';
    media: GifStudioMedia;
    videoUrl: string;
    filmstripUrl: string;
    filmstripFrames: number;
  } |
  { status: 'error'; media: GifStudioMedia; message: string };

let current: StudioSession = { status: 'empty' };
/** 미디어가 빠르게 바뀔 때 늦게 도착한 이전 미리보기를 버리기 위한 세대 번호. */
let generation = 0;
let initialized = false;
const listeners = new Set<() => void>();

export function getStudioSession(): StudioSession {
  return current;
}

export function subscribeStudioSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(next: StudioSession): void {
  if (current.status === 'ready') {
    URL.revokeObjectURL(current.videoUrl);
    URL.revokeObjectURL(current.filmstripUrl);
  }
  current = next;
  for (const listener of listeners) listener();
}

function openMedia(media: GifStudioMedia): void {
  generation += 1;
  const mine = generation;
  // 이전 미디어의 프레임 정지화면 캐시를 버린다 (프레임 문서는 Workspace 가 격자와 함께 초기화).
  clearFrameCache();
  // 주석 캔버스를 새 미디어 크기로 초기화 — 도형·undo 기록도 비운다.
  // 배경(프레임 정지화면)은 hook/useFrameBackground 가 프레임마다 imageSrc 로 채운다.
  useEditorStore.getState().loadImage('', media.width, media.height);
  useEditorStore.getState().setTool('select');
  // 프레임 문서를 비우고 기본 출력 설정의 격자로 시작한다 (Workspace 가 설정 변경 시 다시 맞춘다).
  resetFrames(makeGrid({ start: 0, end: media.duration }, defaultSettings(media).fps, 1));
  commit({ status: 'loading', media });

  window.gifStudio.loadPreview(media.path).then((preview) => {
    if (mine !== generation) return;
    commit({
      status: 'ready',
      media,
      videoUrl: URL.createObjectURL(new Blob([preview.video], { type: 'video/mp4' })),
      filmstripUrl: URL.createObjectURL(new Blob([preview.filmstrip], { type: 'image/png' })),
      filmstripFrames: preview.filmstripFrames,
    });
  }).catch((err: unknown) => {
    if (mine !== generation) return;
    commit({ status: 'error', media, message: errorMessage(err) });
  });
}

/** main.tsx 에서 createRoot 전에 1회 — 창 수명 = 리스너 수명이라 cleanup 은 버린다. */
export function initStudioSession(): void {
  if (initialized) return;
  initialized = true;
  installFramesSync();
  window.gifStudio.onMedia(openMedia);
  window.gifStudio.getMedia().then((media) => {
    // null = 아직 미디어 없음 (정상). push 가 먼저 와서 이미 열렸다면 중복으로 열지 않는다.
    if (media && current.status === 'empty') openMedia(media);
  }).catch((err: unknown) => {
    console.error('[asis gif-studio] getMedia 실패', err);
  });
}
