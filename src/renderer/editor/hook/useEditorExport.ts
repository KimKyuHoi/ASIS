import { useEffect, useRef, useState, type RefObject } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '../lib/store';
import { copyToClipboard, stageToDataUrl } from '../lib/editor-actions';
import { snapshotProject } from '../lib/editor-project';

const SAVE_TOAST_MS = 2500;

/** 저장 결과 알림 — 성공이면 저장 경로, 실패면 사전 문구만(원인은 콘솔). */
export type SaveNotice = { kind: 'saved'; path: string } | { kind: 'failed' };

/**
 * 복사·폴더 저장·핀 — Stage 를 캡처 원본 픽셀로 export 해 main 에 넘긴다.
 *
 * exportPixelRatio = 캡처 원본 픽셀 / 논리 크기. devicePixelRatio 가 아니라 이미지 자체에서
 * 구한다: main 의 논리 크기 환산(주 디스플레이 scaleFactor)이 캡처된 디스플레이와
 * 달라도 결과는 항상 원본 픽셀 크기가 된다. stageScale(fit·줌)은 stageToDataUrl 이 1 로
 * 고정해 export 하므로 여기 섞지 않는다.
 * 이미지 로드 전(bgImage null)에는 Stage 가 렌더되지 않아 export 경로 자체가 없다 —
 * 0 은 그 구간의 자리값이며 stageToDataUrl 이 0 을 받으면 throw 한다.
 */
export function useEditorExport(
  stageRef: RefObject<Konva.Stage | null>,
  bgImage: HTMLImageElement | null,
): {
  exportPixelRatio: number;
  saveNotice: SaveNotice | null;
  onCopy: () => void;
  onSaveFolder: () => void;
  onPin: () => void;
} {
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);
  // 알림 타이머 — 연속 저장 시 앞 타이머가 뒤 알림을 일찍 지우지 않게 새로 띄울 때 지운다.
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
  }, []);
  const showNotice = (notice: SaveNotice): void => {
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    setSaveNotice(notice);
    noticeTimer.current = setTimeout(() => setSaveNotice(null), SAVE_TOAST_MS);
  };
  const exportPixelRatio = bgImage && imageWidth > 0 ? bgImage.naturalWidth / imageWidth : 0;

  const onCopy = (): void => {
    copyToClipboard(stageRef.current, exportPixelRatio);
  };

  const onSaveFolder = (): void => {
    const stage = stageRef.current;
    if (!stage) {
      console.error('[asis editor] saveFolder: stage null');
      return;
    }
    const dataUrl = stageToDataUrl(stage, exportPixelRatio);
    window.editor.saveFolder(dataUrl).then(
      (result) => {
        console.info(`[asis editor] 폴더 저장 완료: ${result.path}`);
        showNotice({ kind: 'saved', path: result.path });
      },
      (err: unknown) => {
        console.error('[asis editor] saveFolder 실패', err);
        showNotice({ kind: 'failed' });
      },
    );
  };

  const onPin = (): void => {
    const stage = stageRef.current;
    if (!stage) {
      console.error('[asis editor] pin: stage null');
      return;
    }
    const dataUrl = stageToDataUrl(stage, exportPixelRatio);
    // Stage 가 있으면 bgImage 도 로드돼 있다 (Stage 는 bgImage 로드 후에만 렌더).
    if (!bgImage) throw new Error('editor pin: stage 는 있는데 bgImage 가 없다');
    // pinWindow.pin 은 *물리 픽셀* 을 받아 scaleFactor 로 나눈다 — 논리 크기(imageWidth)를
    // 넘기면 Retina 에서 한 번 더 나뉘어 핀이 절반 크기로 뜬다. export 와 같은 원본 픽셀을 넘긴다.
    // 편집본을 함께 보내 히스토리 [편집]으로 다시 열 수 있게 한다.
    const { naturalWidth, naturalHeight } = bgImage;
    window.editor.pin(dataUrl, naturalWidth, naturalHeight, snapshotProject()).catch(
      (err: unknown) => {
        console.error('[asis editor] pin 실패', err);
      },
    );
  };

  return { exportPixelRatio, saveNotice, onCopy, onSaveFolder, onPin };
}
