import { globalShortcut } from 'electron';

const ESC_ACCEL = 'Escape';

/**
 * 전역 ESC 점유 핸들 — 녹화·선택 기능이 "알약이 숨겨져도 ESC 로 취소" 하려고 쓴다.
 *
 * 전역 단축키는 프로세스 전역이라, 다른 기능이 이미 ESC 를 쥐고 있으면 register 가 실패한다.
 * 그때도 무조건 unregister 하면 *남의* ESC(예: 녹화 중 연 영역 선택의 취소 키)를 지워 버린다
 * — 등록에 성공한 쪽만, 한 번만 해제한다.
 */
export type EscClaim = {
  /** 이 핸들이 지금 ESC 를 쥐고 있는지. */
  readonly owned: boolean;
  /** 쥐고 있을 때만 해제한다(여러 번 불러도 안전). */
  release: () => void;
};

export function claimEsc(onEsc: () => void): EscClaim {
  let owned = globalShortcut.register(ESC_ACCEL, onEsc);
  return {
    get owned(): boolean {
      return owned;
    },
    release: (): void => {
      if (!owned) return;
      globalShortcut.unregister(ESC_ACCEL);
      owned = false;
    },
  };
}
