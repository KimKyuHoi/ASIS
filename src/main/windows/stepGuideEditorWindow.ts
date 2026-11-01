import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import log from 'electron-log/main';
import type { GuideDraft, GuideEdits, GuideSaveResult } from '../../shared/step-guide';
import { loadRendererPage, preloadPath } from './common';
import { applyEdits, guideFileName, toDraft } from '../step-guide/guideDraft';
import { tGuide } from '../step-guide/guideCopy';
import { toHtml, type Guide } from '../step-guide/stepGuideExport';
import { UserFacingError } from '../userFacingError';
import { hiddenWindows } from './hiddenWindows';

const CHANNEL_GET_DRAFT = 'step-guide-editor:get-draft';
const CHANNEL_SAVE = 'step-guide-editor:save';

/**
 * 문서 HTML 하나에 담을 이미지 data URL 총 길이 상한(문자 수).
 * V8 문자열 최대 길이(Electron 39 실측 buffer.constants.MAX_STRING_LENGTH = 536,870,888)를
 * 넘기면 toHtml 이 RangeError 로 죽는다. CSS·마크업 몫을 남겨 약 75% 에서 끊는다.
 * Retina 전체 화면 PNG 한 장이 data URL 로 5~10M 자라 대략 40~80 단계에 해당한다.
 */
const MAX_IMAGE_CHARS = 400_000_000;

export type GuideEditorHandlers = {
  /** 사용자가 [저장]으로 파일을 썼다 — 경로 안내용. */
  onSaved: (path: string) => void;
  /** 저장 실패 — 사용자용 사전 문구. 원문은 이미 로그에 남긴 뒤 호출된다. */
  onError: (message: string) => void;
};

type EditorSession = {
  win: BrowserWindow;
  draft: GuideDraft;
  handlers: GuideEditorHandlers;
};

/**
 * 스텝 가이드 편집 창 — 녹화를 [완료]하면 저장 *전에* 뜨는 앱 전용 에디터.
 *
 *   1. open(guide): 녹화 결과를 초안(GuideDraft)으로 만들어 이 창에 배정하고 React 페이지
 *      ('step-guide' 엔트리, ?view=editor)를 띄운다. 파일은 아직 만들지 않는다.
 *   2. renderer 가 getDraft 로 초안을 받아 제목·문장·순서·삭제를 편집한다.
 *   3. [저장] → save(edits): 저장 다이얼로그 → applyEdits → toHtml → 단일 HTML 쓰기.
 *      저장 후에도 창은 열려 있어 계속 고치고 다시 저장할 수 있다.
 *   4. 닫을 때 renderer 의 미저장 표시(window.asisGuideEditorDirty)를 읽어 확인 창을 띄운다.
 *      앱 종료(before-quit)는 closeAllForQuit 으로 같은 확인을 거친다.
 *
 * IPC 핸들러는 프로세스 전역 1회 등록하고, event.sender.id 로 창별 세션을 찾는다
 * (편집 창이 여러 개 떠도 서로의 초안을 섞지 않는다).
 *
 * side-effects.md Rule 3 — 창 lifecycle 소유는 Class.
 */
export class GuideEditorWindows {
  private readonly sessions = new Map<number, EditorSession>();
  /** 앱 종료 요청 중인 창 → 닫혔는지(true)/사용자가 닫기를 취소했는지(false) 알릴 곳. */
  private readonly closeWaiters = new Map<number, (closed: boolean) => void>();
  /** 닫기 확인을 통과한 창 — 다음 close 이벤트는 그대로 닫힌다. */
  private readonly approvedClose = new Set<number>();
  /** 닫기 판단(미저장 조회·확인 창) 진행 중인 창 — 연타로 확인 창이 겹치지 않게. */
  private readonly deciding = new Set<number>();
  private ipcInstalled = false;

  open(guide: Guide, handlers: GuideEditorHandlers): Promise<void> {
    this.installIpc();
    const win = new BrowserWindow({
      width: 1120,
      height: 780,
      minWidth: 760,
      minHeight: 520,
      title: tGuide().editorWindowTitle,
      titleBarStyle: 'hiddenInset',
      show: false,
      webPreferences: {
        preload: preloadPath(),
        sandbox: false,
      },
    });
    hiddenWindows.hideOnMinimize(win);
    const contentsId = win.webContents.id;
    const session: EditorSession = { win, draft: toDraft(guide), handlers };
    this.sessions.set(contentsId, session);

    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // 닫기 확인은 renderer 의 beforeunload 가 아니라 여기서 한다. beforeunload 는 한 번
    // 취소된 뒤 페이지에 새 사용자 입력이 없으면 Chromium 이 두 번째 시도를 진행하지 않아
    // (실측: will-prevent-unload 도 close 도 안 옴) "⌘Q → 취소 → ⌘Q" 에서 창이 굳는다.
    win.on('close', (event) => {
      if (this.approvedClose.has(contentsId)) return;
      event.preventDefault();
      this.decideClose(contentsId, win).catch((err: unknown) => {
        log.error('[step-guide] 편집 창 닫기 판단 실패', err);
        this.settleClose(contentsId, false);
      });
    });
    win.once('ready-to-show', () => {
      hiddenWindows.prepareShow(win);
      win.show();
      win.focus();
    });
    win.on('closed', () => {
      // 초안은 이미지 data URL(수 MB~수십 MB)을 들고 있다 — 창과 함께 놓아 준다.
      this.sessions.delete(contentsId);
      this.approvedClose.delete(contentsId);
      this.deciding.delete(contentsId);
      this.settleClose(contentsId, true);
    });

    return loadRendererPage(win, 'step-guide', { view: 'editor' }).catch((err: unknown) => {
      // 로드 도중 사용자가 창을 닫은 경우는 실패가 아니다.
      if (win.isDestroyed()) return;
      // 숨은 창과 초안(수 MB data URL)이 남지 않게 정리하고 실패를 올린다.
      win.destroy();
      throw err;
    });
  }

  /** 떠 있는 편집 창들 — 녹화 중 이 창 위 클릭을 단계에서 빼는 데 쓴다. */
  windows(): BrowserWindow[] {
    return [...this.sessions.values()].map((s) => s.win).filter((w) => !w.isDestroyed());
  }

  /** 편집 창이 하나라도 떠 있는지 — 앱 종료 전 확인용. */
  hasOpen(): boolean {
    return this.sessions.size > 0;
  }

  /**
   * 앱 종료 요청 — 각 창을 *정상적으로* 닫아 미저장 창은 확인 창을 띄운다.
   * 모두 닫히면 true, 하나라도 사용자가 취소하면 false(호출자는 종료를 멈춘다).
   */
  closeAllForQuit(): Promise<boolean> {
    const decisions = [...this.sessions].map(
      ([id, session]) =>
        new Promise<boolean>((resolve) => {
          this.closeWaiters.set(id, resolve);
          session.win.close();
        }),
    );
    return Promise.all(decisions).then((results) => results.every(Boolean));
  }

  /** 미저장이면 "저장하지 않고 닫기" 를 묻고, 승인되면 실제로 닫는다. */
  private async decideClose(contentsId: number, win: BrowserWindow): Promise<void> {
    if (this.deciding.has(contentsId)) return;
    this.deciding.add(contentsId);
    try {
      const dirty = await isEditorDirty(win);
      if (win.isDestroyed()) return;
      if (dirty) {
        // 노란 버튼으로 숨긴 창이면 확인 시트가 보이지 않는 창에 붙어(동기 호출이라 main 이
        // 멈춘 것처럼 된다) 사용자가 답할 수 없다 — 먼저 창을 되살려 보여 준다.
        hiddenWindows.prepareShow(win);
        if (!win.isVisible()) win.show();
      }
      if (dirty && !confirmDiscard(win)) {
        // 닫기 취소 — 앱 종료 요청 중이었다면 종료도 멈추게 알린다.
        this.settleClose(contentsId, false);
        return;
      }
      this.approvedClose.add(contentsId);
      win.close();
    } finally {
      this.deciding.delete(contentsId);
    }
  }

  /** 종료 요청 중인 창의 닫기 결과를 알린다. 종료 요청이 아니면(평소 닫기) 할 일 없음. */
  private settleClose(contentsId: number, closed: boolean): void {
    const resolve = this.closeWaiters.get(contentsId);
    if (!resolve) return;
    this.closeWaiters.delete(contentsId);
    resolve(closed);
  }

  /** 강제 종료(업데이트 설치 등) — 확인 없이 닫는다(destroy 는 beforeunload 를 거치지 않음). */
  closeAll(): void {
    for (const { win } of this.sessions.values()) {
      if (!win.isDestroyed()) win.destroy();
    }
    this.sessions.clear();
  }

  private installIpc(): void {
    if (this.ipcInstalled) return;
    this.ipcInstalled = true;
    ipcMain.handle(CHANNEL_GET_DRAFT, (event) => this.sessionOf(event).draft);
    ipcMain.handle(CHANNEL_SAVE, (event, edits: GuideEdits) => this.save(event, edits));
  }

  private sessionOf(event: IpcMainInvokeEvent): EditorSession {
    const session = this.sessions.get(event.sender.id);
    if (!session) throw new Error(`스텝 가이드 편집 창이 아닌 곳의 요청 — webContents ${event.sender.id}`);
    return session;
  }

  private async save(event: IpcMainInvokeEvent, edits: GuideEdits): Promise<GuideSaveResult> {
    const session = this.sessionOf(event);
    try {
      return await this.saveDocument(session, edits);
    } catch (err) {
      // 편집 창(renderer) 콘솔은 main.log 로 이어지지 않는다 — 원인(EACCES 등)은 여기서 남긴다.
      log.error('[step-guide] 가이드 저장 실패', err, err instanceof UserFacingError ? err.detail : '');
      session.handlers.onError(
        err instanceof UserFacingError ? err.message : tGuide().saveFailedNotice,
      );
      throw err;
    }
  }

  private async saveDocument(session: EditorSession, edits: GuideEdits): Promise<GuideSaveResult> {
    // 검증을 다이얼로그 *전에* — 잘못된 id·너무 큰 문서면 사용자가 위치를 고른 뒤에 실패하지 않게.
    const doc = applyEdits(session.draft, edits);
    const imageChars = doc.steps.reduce((sum, s) => sum + s.imageDataUrl.length, 0);
    if (imageChars > MAX_IMAGE_CHARS) {
      throw new UserFacingError(
        tGuide().guideTooLarge,
        `이미지 data URL 합계 ${imageChars}자 > 상한 ${MAX_IMAGE_CHARS}자 (단계 ${doc.steps.length}개)`,
      );
    }
    const t = tGuide();
    const result = await dialog.showSaveDialog(session.win, {
      title: t.saveDialogTitle,
      defaultPath: join(app.getPath('documents'), guideFileName(doc.title)),
      filters: [{ name: t.htmlFilterName, extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) return { kind: 'canceled' };
    await writeFile(result.filePath, toHtml(doc), 'utf8');
    session.handlers.onSaved(result.filePath);
    // 저장이 끝나면 창을 닫는다(이미지 에디터의 저장·복사 후 닫힘과 같은 결). 방금 저장했으므로
    // "저장하지 않고 닫기" 확인 없이 닫고, invoke 응답을 renderer 에 먼저 돌려준 뒤 닫는다.
    const { win } = session;
    this.approvedClose.add(win.webContents.id);
    setImmediate(() => {
      if (!win.isDestroyed()) win.close();
    });
    return { kind: 'saved', path: result.filePath };
  }
}

/** renderer(GuideEditor)가 window 에 걸어 두는 미저장 표시 — useEditorWindowEvents 참고. */
const DIRTY_FLAG = 'asisGuideEditorDirty';
/** renderer 가 응답하지 않을 때(멈춤·크래시) 기다리는 한도. 넘기면 미저장으로 보고 묻는다. */
const DIRTY_QUERY_TIMEOUT_MS = 1500;

/**
 * 편집 창이 미저장 상태인지 — 알 수 없으면(응답 없음·실행 실패) true 로 본다.
 * 녹화 결과는 메모리에만 있으므로 "모르면 묻는다" 가 안전한 쪽이다.
 */
async function isEditorDirty(win: BrowserWindow): Promise<boolean> {
  const query = win.webContents
    .executeJavaScript(`window.${DIRTY_FLAG} !== false`)
    .then((v: unknown) => v !== false);
  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, DIRTY_QUERY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([query, timeout]);
  } catch (err) {
    log.warn('[step-guide] 편집 창 미저장 조회 실패 — 미저장으로 간주', err);
    return true;
  }
}

/** 미저장 편집을 버리고 닫을지 묻는다. true = 닫기. */
function confirmDiscard(win: BrowserWindow): boolean {
  const t = tGuide();
  const choice = dialog.showMessageBoxSync(win, {
    type: 'warning',
    message: t.unsavedTitle,
    detail: t.unsavedDetail,
    buttons: [t.unsavedDiscard, t.unsavedCancel],
    defaultId: 1,
    cancelId: 1,
  });
  return choice === 0;
}
