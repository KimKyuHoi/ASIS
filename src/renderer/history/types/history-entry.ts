/** 캡처 히스토리 한 건 (main/captureHistory.ts 의 HistoryEntry 와 동일 형태). */
export type HistoryEntry = {
  id: string;
  dataUrl: string;
  timestamp: number;
  width: number;
  height: number;
  /** 다시 편집용 원본이 남아 있는지 — 최신 몇 개에만 보관된다(main/captureHistory.ts). */
  editable: boolean;
};
