import { useState } from 'react';
import type { JSX } from 'react';
import type { Language } from '../../../shared/i18n/language';
import { useLanguage } from '../../../shared/i18n/use-language';

/**
 * 첫 실행 언어 선택 화면.
 *
 * 두 버튼 라벨은 각 언어 원어로 고정 표기 — 어떤 언어 사용자든 자기 언어를
 * 바로 찾을 수 있어야 하므로 사전을 쓰지 않는다. 안내 문구만 현재 언어를 따른다.
 */
export default function Onboarding(): JSX.Element {
  const lang = useLanguage();
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
      <div className="onboarding__logo">ASIS</div>
      <p className="onboarding__subtitle">
        {lang === 'ko' ? '사용할 언어를 선택해 주세요' : 'Choose your language'}
      </p>
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
      <p className="onboarding__note">
        {lang === 'ko'
          ? '나중에 환경설정에서 변경할 수 있어요'
          : 'You can change this later in Settings'}
      </p>
    </div>
  );
}
