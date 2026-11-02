/**
 * GIF 스튜디오 main ↔ renderer 계약 타입.
 *
 * 순수 타입만 둔다 — renderer(tsconfig.web)가 `import type` 으로 끌어가므로
 * electron·node 모듈을 import 하면 안 된다 (preload/index.d.ts 가 main/settings
 * 타입을 가져가는 것과 같은 방식).
 */

/** 창을 여는 진입점 — (a) 녹화 직후 tmp GIF, (b) open-file 로 들어온 .gif, (c) 사용자가 고른 영상. */
export type GifStudioSource = {
  kind: 'gif' | 'video';
  path: string;
  /** true 면 창을 닫거나 다른 파일로 바꿀 때 원본을 지운다 (녹화 직후 tmp GIF). */
  deleteOnClose: boolean;
};

/** ffmpeg 로 읽은 원본 정보. width/height 는 회전 메타데이터를 반영한 표시 크기. */
export type GifStudioMedia = {
  kind: 'gif' | 'video';
  path: string;
  name: string;
  size: number;
  width: number;
  height: number;
  /** 초 단위. */
  duration: number;
  /** 배너의 평균 fps. 컨테이너가 알려 주지 않으면 null — 렌더러가 기본 FPS 를 쓴다. */
  fps: number | null;
  deleteOnClose: boolean;
};

/** 렌더러가 재생·트림 UI 에 쓰는 미리보기 자원 — 둘 다 main 이 만든 tmp 파일의 바이트. */
export type GifStudioPreview = {
  /** H.264 mp4 프록시 — GIF·ProRes·HEVC 모두 <video> 로 seek 가능하게 통일. */
  video: Uint8Array<ArrayBuffer>;
  /** 가로로 이어 붙인 썸네일 한 장 (PNG). */
  filmstrip: Uint8Array<ArrayBuffer>;
  filmstripFrames: number;
};

export type GifExportOptions = {
  /** 원본 기준 초 단위 구간. */
  start: number;
  end: number;
  /** 출력 픽셀 크기. */
  width: number;
  height: number;
  fps: number;
  /** 1~100 — palettegen max_colors 로 매핑. */
  quality: number;
  /** 재생 속도 배율 (0.25~4). */
  speed: number;
};

export type GifExportTarget = 'folder' | 'save-as' | 'clipboard';

/** 주석 오버레이 한 구간 — 이 원본 시간 [start, end) 동안 images[image] 를 얹는다. */
export type GifOverlaySegment = {
  start: number;
  end: number;
  image: number;
};

/**
 * 프레임별 주석 — 보이는 주석 조합이 바뀌는 구간마다 원본 크기 투명 PNG 한 장.
 * segments 는 트림 구간 [options.start, options.end] 를 빈틈없이 순서대로 덮는다.
 * 같은 조합은 images 를 공유한다 (주석이 없는 구간도 투명 PNG 하나를 가리킨다).
 */
export type GifOverlayTrack = {
  /** PNG data URL 목록. */
  images: string[];
  segments: GifOverlaySegment[];
};

export type GifExportRequest = {
  /** 이 요청을 만든 미디어 — 굽는 사이 창의 파일이 바뀌었으면 main 이 거절한다. */
  mediaPath: string;
  options: GifExportOptions;
  /** 프레임별 주석 오버레이. 주석이 하나도 없으면 null. */
  overlay: GifOverlayTrack | null;
  target: GifExportTarget;
};

export type GifExportResult =
  | { kind: 'saved'; path: string; size: number } |
  { kind: 'copied'; size: number } |
  { kind: 'canceled' };

/** preload 가 window.gifStudio 로 노출하는 API. */
export type GifStudioAPI = {
  /** 현재 열린 미디어 (아직 없으면 null). */
  getMedia: () => Promise<GifStudioMedia | null>;
  /** main 이 다른 파일로 교체할 때 push. 반환값은 cleanup. */
  onMedia: (callback: (media: GifStudioMedia) => void) => () => void;
  loadPreview: (path: string) => Promise<GifStudioPreview>;
  /** 파일 선택 다이얼로그 → 고른 파일로 교체. 취소하면 false. */
  pick: () => Promise<boolean>;
  export: (request: GifExportRequest) => Promise<GifExportResult>;
  cancelExport: () => Promise<void>;
  reveal: (path: string) => Promise<void>;
  close: () => void;
};
