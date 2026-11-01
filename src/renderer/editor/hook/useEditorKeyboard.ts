import { useEffect, type RefObject } from 'react';
import type Konva from 'konva';
import { codeToKeyName } from '../../../shared/key-name';
import { useEditorStore } from '../lib/store';
import { toolForKeyName } from '../lib/editor-hotkeys';
import { cancelEditor, copyToClipboard, savePngFile } from '../lib/editor-actions';
import { copySelectedShapes, pasteShapesOrImage } from '../lib/editor-clipboard';
import { commitCrop } from '../lib/crop';

type EditorState = ReturnType<typeof useEditorStore.getState>;
type KeyCtx = {
  e: KeyboardEvent;
  st: EditorState;
  isMeta: boolean;
  stageRef: RefObject<Konva.Stage | null>;
  pixelRatio: number;
  /** 크롭 적용에 쓰는 지금 배경. 이미지 로드 전에는 null (그때는 크롭 모드에 들어갈 수 없다). */
  bgImage: HTMLImageElement | null;
};
/** 단축키 한 건 — match 가 참인 첫 항목만 실행한다 (순서 = 우선순위). */
type KeyCommand = {
  match: (c: KeyCtx) => boolean;
  run: (c: KeyCtx) => void;
  /** 브라우저 기본 동작 막기 (기본 true). */
  preventDefault?: boolean;
};

const ZOOM_STEP = 1.25;

// e.code 는 *물리 키 코드* (KeyV/KeyR…) — 한영 IME, 대소문자, Caps Lock 무관.
const KEY_COMMANDS: KeyCommand[] = [
  // ── 크롭 모드 — 아래 일반 단축키보다 먼저 본다.
  {
    match: (c) => c.st.cropping && c.e.key === 'Enter',
    run: (c) => {
      if (!c.bgImage) throw new Error('크롭 적용: 크롭 모드인데 배경 이미지가 없다');
      commitCrop(c.bgImage).catch((err: unknown) => {
        console.error('[asis editor] 크롭 적용 실패', err);
      });
    },
  },
  { match: (c) => c.st.cropping && c.e.key === 'Escape', run: (c) => c.st.cancelCrop() },
  {
    // 크롭 중 복사·저장·붙여넣기는 막는다 — 잘리기 전 이미지가 나가거나 영역 밖에 붙는 혼란 방지.
    match: (c) => c.st.cropping && c.isMeta && ['KeyC', 'KeyS', 'KeyV'].includes(c.e.code),
    run: () => {},
  },
  {
    // 선택이 있으면 내부 도형 클립보드로, 없으면 이미지 전체를 시스템 클립보드로 export.
    match: (c) => c.isMeta && c.e.code === 'KeyC',
    run: (c) => {
      if (c.st.selectedIds.length > 0) copySelectedShapes();
      else copyToClipboard(c.stageRef.current, c.pixelRatio);
    },
  },
  {
    match: (c) => c.isMeta && c.e.code === 'KeyS',
    run: (c) => savePngFile(c.stageRef.current, c.pixelRatio),
  },
  { match: (c) => c.isMeta && c.e.code === 'KeyV', run: () => pasteShapesOrImage() },
  { match: (c) => c.isMeta && !c.e.shiftKey && c.e.code === 'KeyZ', run: (c) => c.st.undo() },
  { match: (c) => c.isMeta && c.e.shiftKey && c.e.code === 'KeyZ', run: (c) => c.st.redo() },
  { match: (c) => c.isMeta && c.e.code === 'KeyW', run: () => cancelEditor() },
  {
    // +(=) 줌 인 — 작은 캡처 돋보기. ⌘+ 도 동일. clamp 는 store setZoom 이 처리.
    match: (c) => c.e.code === 'Equal' || c.e.code === 'NumpadAdd',
    run: (c) => c.st.setZoom(c.st.zoom * ZOOM_STEP),
  },
  {
    // - 줌 아웃. ⌘- 도 동일.
    match: (c) => c.e.code === 'Minus' || c.e.code === 'NumpadSubtract',
    run: (c) => c.st.setZoom(c.st.zoom / ZOOM_STEP),
  },
  { match: (c) => c.isMeta && c.e.code === 'Digit0', run: (c) => c.st.setZoom(1) },
  { match: (c) => c.e.key === 'Escape', run: () => cancelEditor(), preventDefault: false },
  {
    match: (c) =>
      (c.e.key === 'Delete' || c.e.key === 'Backspace') && c.st.selectedIds.length > 0,
    run: (c) => c.st.deleteSelected(),
  },
  {
    // 도구 전환 — 환경설정의 표(lib/editor-hotkeys)를 조회한다. 해제된 도구는 매칭 안 됨.
    match: (c) => !c.isMeta && !c.e.shiftKey,
    run: (c) => {
      const keyName = codeToKeyName(c.e.code);
      const next = keyName === null ? null : toolForKeyName(keyName);
      if (next) c.st.setTool(next);
    },
    preventDefault: false,
  },
];

/**
 * 에디터 전역 키보드 단축키 등록.
 *
 * - 텍스트 인라인 편집 중(editingId !== null)에는 모든 단축키 무시.
 * - capture phase 로 등록해 textarea stopPropagation 에 상관없이 우리가 먼저 받음.
 *   (단, editingId 체크로 textarea 활성 중에는 곧바로 return.)
 */
export function useEditorKeyboard(
  stageRef: RefObject<Konva.Stage | null>,
  { pixelRatio, bgImage }: Omit<KeyCtx, 'e' | 'st' | 'isMeta' | 'stageRef'>,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useEditorStore.getState();
      console.info(
        `[asis editor] keydown key=${e.key} code=${e.code} editingId=${String(st.editingId)} selected=${String(st.selectedIds.length)}`,
      );
      if (st.editingId !== null) return;
      const ctx: KeyCtx = {
        e, st, isMeta: e.metaKey || e.ctrlKey, stageRef, pixelRatio, bgImage,
      };
      const cmd = KEY_COMMANDS.find((k) => k.match(ctx));
      if (!cmd) return;
      if (cmd.preventDefault !== false) e.preventDefault();
      cmd.run(ctx);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [stageRef, pixelRatio, bgImage]);
}
