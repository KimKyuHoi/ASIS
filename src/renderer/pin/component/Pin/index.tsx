import { useReducer, type CSSProperties, type JSX } from 'react';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { pinStrings } from '../../lib/strings';
import { INITIAL_PIN_VIEW, imageTransform, pinViewReducer } from '../../lib/pin-view';
import { usePinImage } from '../../hook/usePinImage';
import { usePinLock } from '../../hook/usePinLock';
import { usePinInput } from '../../hook/usePinInput';
import { usePinWindowSize } from '../../hook/usePinWindowSize';
import { LockChip } from './LockChip';
import { StateToast } from './StateToast';

/**
 * Pin to Screen — 캡처 결과(또는 클립보드 이미지)를 떠있는 작은 윈도우로 표시.
 *
 * 상태 표시 (Snipaste 결 + 고정 상태 가시화)
 *   - 일반   : 평소엔 이미지만. hover 하면 흰 헤어라인 프레임 + 닫기 버튼.
 *   - 고정   : (click-through) 좌상단 잠금 칩이 *항상* 보인다. hover 하면 칩이 펼쳐져
 *             해제 방법을 알리고, 이미지가 옅어져 아래 창이 비친다 — 클릭이 아래로
 *             간다는 것을 눈으로 확인시킨다. forward:true 라 고정 중에도 hover 를 받는다.
 *   - 전환 시: 가운데 HUD 토스트로 "클릭 통과 켜짐/꺼짐" 을 잠깐 띄운다.
 */
export default function Pin(): JSX.Element {
  const [view, dispatch] = useReducer(pinViewReducer, INITIAL_PIN_VIEW);
  const image = usePinImage(dispatch);
  const lock = usePinLock();
  const t = pinStrings[useLanguage()];
  usePinInput(dispatch, lock.toggle);
  usePinWindowSize(image, view);

  if (!image) {
    return <div className="pin-placeholder" />;
  }

  const rootClass = lock.clickThrough ? 'pin pin--locked' : 'pin';
  const imageStyle: CSSProperties = { transform: imageTransform(view) };

  return (
    <div className={rootClass}>
      {/* 투명도는 이미지에만 — 칩·토스트까지 흐려지면 상태가 다시 안 보인다. */}
      <div className="pin__surface" style={{ opacity: view.opacity }}>
        <img className="pin__image" src={image.src} alt="pinned" style={imageStyle} draggable={false} />
      </div>
      <div className="pin__frame" aria-hidden="true" />
      {lock.clickThrough ? (
        <LockChip label={t.lockedChip} hint={t.lockedHint(lock.releaseHotkey)} />
      ) : (
        <button type="button" className="pin__close" onClick={() => window.pin.close()} aria-label={t.close}>
          <span className="pin__close-glyph">×</span>
        </button>
      )}
      {lock.toast ? (
        <StateToast
          key={lock.toast.id}
          locked={lock.toast.locked}
          title={lock.toast.locked ? t.toastLocked : t.toastUnlocked}
          hint={lock.toast.locked ? t.toastLockedHint(lock.releaseHotkey) : null}
          onDone={lock.dismissToast}
        />
      ) : null}
    </div>
  );
}
