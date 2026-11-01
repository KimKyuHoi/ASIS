/**
 * 스텝 가이드 편집 창(renderer) ↔ main 계약.
 * main 은 녹화 결과를 GuideDraft 로 넘기고, 편집 창은 텍스트·순서·삭제만 GuideEdits 로 돌려준다
 * (이미지는 main 이 들고 있으므로 다시 보내지 않는다 — id 로 매칭).
 */
export type GuideStepKind = 'image' | 'gif';

/** 이미지 픽셀 기준 사각형. */
export type GuideRect = { x: number; y: number; w: number; h: number };

export type GuideDraftStep = {
  id: string;
  kind: GuideStepKind;
  /** image=PNG, gif=GIF base64 data URL. */
  imageDataUrl: string;
  width: number;
  height: number;
  /** 클릭 위치(이미지 픽셀). gif 는 마커 없음 — 무시. */
  clickX: number;
  clickY: number;
  /** 클릭한 UI 요소 영역. 모르면 null. */
  target: GuideRect | null;
  /** 클릭한 창의 앱 이름. 모르면 null. */
  appName: string | null;
  /** 자동 생성된 기본 문장. */
  caption: string;
  note: string;
};

export type GuideDraft = {
  title: string;
  description: string;
  createdAt: number;
  steps: GuideDraftStep[];
};

export type GuideEdits = {
  title: string;
  description: string;
  /** 문서에 남길 단계 — 배열 순서가 최종 순서, 빠진 id 는 삭제. */
  steps: {
    id: string;
    caption: string;
    note: string;
    /**
     * 편집 창에서 주석을 그린 단계만 — 원본에 주석을 합성한 PNG data URL.
     * 실제로 옵셔널: 주석이 없는 단계·GIF 단계는 null 이고 main 은 원본 이미지를 쓴다.
     */
    annotatedImageDataUrl: string | null;
  }[];
};

export type GuideSaveResult = { kind: 'saved'; path: string } | { kind: 'canceled' };
