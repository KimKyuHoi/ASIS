import { useState } from 'react';
import type { GuideEdits } from '../../../shared/step-guide';

export type SaveStatus =
  | { kind: 'never' } |
  { kind: 'saving' } |
  { kind: 'saved'; name: string } |
  { kind: 'failed' };

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * [저장…] 흐름 — main 이 저장 다이얼로그를 띄우고 단일 HTML 을 쓴다.
 * 저장에 성공하면 onSaved 로 그 시점 스냅샷을 "저장됨" 기준으로 삼게 한다.
 * 실패는 삼키지 않고 status 로 화면에 드러낸다.
 */
export function useGuideSave(options: {
  /** 저장할 편집 결과를 만든다 — 주석 합성 이미지를 채우느라 비동기. */
  prepareEdits: () => Promise<GuideEdits>;
  canSave: boolean;
  onSaved: () => void;
}): { status: SaveStatus; requestSave: () => void } {
  const { prepareEdits, canSave, onSaved } = options;
  const [status, setStatus] = useState<SaveStatus>({ kind: 'never' });

  const save = async (): Promise<void> => {
    if (status.kind === 'saving' || !canSave) return;
    const before = status;
    setStatus({ kind: 'saving' });
    try {
      const edits = await prepareEdits();
      const result = await window.stepGuideEditor.save(edits);
      if (result.kind === 'canceled') {
        // 다이얼로그 취소 — 저장 전 표시로 되돌린다(미저장 여부는 dirty 가 따로 판단).
        setStatus(before);
        return;
      }
      onSaved();
      setStatus({ kind: 'saved', name: baseName(result.path) });
    } catch (err) {
      // IPC 원문("Error invoking remote method…", 파일 시스템 오류)은 사용자 문구로 쓰지 않는다 —
      // 화면엔 사전 문구. 원인은 main(stepGuideEditorWindow.save)이 log.error 로 main.log 에 남기고
      // 사용자 알림도 띄운다. 여기 콘솔 로그는 개발자 도구용.
      console.error('[asis] stepGuideEditor: 저장 실패', err);
      setStatus({ kind: 'failed' });
    }
  };

  const requestSave = (): void => {
    // save 는 내부에서 모든 실패를 status 로 바꾸므로 여기까지 오는 reject 는 버그다.
    save().catch((err: unknown) => {
      console.error('[asis] stepGuideEditor: 저장 흐름 예외', err);
    });
  };

  return { status, requestSave };
}
