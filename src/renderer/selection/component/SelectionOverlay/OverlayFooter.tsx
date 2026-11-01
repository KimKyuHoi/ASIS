import type { JSX } from 'react';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { KeyCap, Toast } from '../../../design-system/component';
import { selectionStrings } from '../../lib/strings';

export function Hint({ visible }: { visible: boolean }): JSX.Element {
  const t = selectionStrings[useLanguage()];
  return (
    <div className={`hint ${visible ? 'hint--visible' : 'hint--hidden'}`}>
      <KeyCap shortcut="Escape" />
      <span className="hint__label">{t.hintCancel}</span>
      <span className="hint__divider" aria-hidden="true" />
      <span>{t.hintSelect}</span>
      <span className="hint__divider" aria-hidden="true" />
      <span>{t.hintColorCopy}</span>
    </div>
  );
}

/** 색상 복사 성공 알림. hex 는 복사된 색상코드. */
export function CopyToast({ hex }: { hex: string }): JSX.Element {
  const t = selectionStrings[useLanguage()];
  return (
    <div className="copy-toast">
      <Toast
        title={`${hex} ${t.copied}`}
        tone="success"
        icon={<span className="copy-toast__swatch" style={{ background: hex }} />}
      />
    </div>
  );
}
