import { useState, type JSX } from 'react';
import type { Language } from '../../../shared/i18n/language';
import { useLanguage } from '../../../shared/i18n/use-language';
import { CaptureFrame } from '../../design-system/component';
import { onboardingStrings } from '../lib/strings';

/** 워드마크를 감싸는 캡처 프레임 크기(px). */
const LOGO_FRAME = { width: 120, height: 52 } as const;

/**
 * 첫 실행 언어 선택 화면.
 *
 * 두 버튼 라벨은 각 언어 원어로 고정 표기 — 어떤 언어 사용자든 자기 언어를
 * 바로 찾을 수 있어야 하므로 사전을 쓰지 않는다. 안내 문구만 현재 언어를 따른다.
 */
export default function Onboarding(): JSX.Element {
  const lang = useLanguage();
  const t = onboardingStrings[lang];
  const [saving, setSaving] = useState(false);

  const choose = (chosen: Language): void => {
    if (saving) return;
    setSaving(true);
    window.i18n
      .setLanguage(chosen)
      .then(() => {
        window.i18n.completeOnboarding();
      })
      .catch((err: unknown) => {
        console.error('[asis onboarding] setLanguage failed', err);
        setSaving(false);
      });
  };

  return (
    <div className="onboarding">
      {/* 워드마크를 ASIS 시그니처인 캡처 프레임으로 감싼다 — 앱이 하는 일을 첫 화면에서 보여 준다. */}
      <CaptureFrame width={LOGO_FRAME.width} height={LOGO_FRAME.height} tone="accent" className="onboarding__logo">
        <span className="onboarding__wordmark">ASIS</span>
      </CaptureFrame>
      <h1 className="onboarding__subtitle">{t.subtitle}</h1>
      <div className="onboarding__choices">
        <button
          type="button"
          className={`lang-btn ${lang === 'ko' ? 'lang-btn--suggested' : ''}`}
          disabled={saving}
          onClick={(): void => choose('ko')}
        >
          <span className="lang-btn__native">한국어</span>
          <span className="lang-btn__hint">Korean</span>
        </button>
        <button
          type="button"
          className={`lang-btn ${lang === 'en' ? 'lang-btn--suggested' : ''}`}
          disabled={saving}
          onClick={(): void => choose('en')}
        >
          <span className="lang-btn__native">English</span>
          <span className="lang-btn__hint">영어</span>
        </button>
      </div>
      <p className="onboarding__note">{t.note}</p>
    </div>
  );
}
