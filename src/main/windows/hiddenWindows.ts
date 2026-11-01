import type { BrowserWindow } from 'electron';

/**
 * 에디터 계열 창(이미지 에디터·GIF 스튜디오·스텝 가이드 편집)의 노란(최소화) 버튼 = 숨김.
 *
 * ASIS 는 accessory 앱이라 Dock 아이콘이 없다 — Dock 으로 최소화하면 되돌아올 길이
 * 눈에 안 띈다. 그래서 최소화되는 순간 창을 숨기고, 트레이 "숨긴 창 다시 보기" 로 복원한다.
 * 'minimize' 는 최소화가 끝난 뒤 오는 이벤트라 막을 수 없다 — 최소화 상태 그대로 숨겨 두고,
 * 복원은 restore()(최소화 해제 + 표시)로 한다 (Electron 39 실측: hide 후 restore → visible).
 */
class HiddenWindowRegistry {
  private readonly hidden = new Set<BrowserWindow>();
  /** 트레이 라벨 갱신용. index.ts 가 트레이를 만든 뒤 연결한다 — 그 전에는 갱신할 메뉴가 없다. */
  private onChange: (() => void) | null = null;

  setChangeListener(listener: () => void): void {
    this.onChange = listener;
  }

  /** 창 생성 직후 한 번 호출. */
  hideOnMinimize(win: BrowserWindow): void {
    win.on('minimize', () => {
      win.hide();
      this.hidden.add(win);
      this.notify();
    });
    win.once('closed', () => {
      if (this.hidden.delete(win)) this.notify();
    });
  }

  /** 다른 경로(새 캡처·같은 파일 다시 열기)로 창을 띄우기 전에 호출 — 숨김 상태를 풀어 둔다. */
  prepareShow(win: BrowserWindow): void {
    if (win.isMinimized()) win.restore();
    if (this.hidden.delete(win)) this.notify();
  }

  count(): number {
    this.pruneDestroyed();
    return this.hidden.size;
  }

  restoreAll(): void {
    this.pruneDestroyed();
    for (const win of this.hidden) win.restore();
    this.hidden.clear();
    this.notify();
  }

  /**
   * 창 매니저가 정리하며 'closed' 리스너를 통째로 지우면(removeAllListeners) 위 정리 리스너도
   * 사라진다 — 그래도 닫힌 창이 개수·복원 대상에 남지 않게 읽을 때마다 걸러 낸다.
   */
  private pruneDestroyed(): void {
    for (const win of this.hidden) {
      if (win.isDestroyed()) this.hidden.delete(win);
    }
  }

  private notify(): void {
    if (this.onChange) this.onChange();
  }
}

export const hiddenWindows = new HiddenWindowRegistry();
