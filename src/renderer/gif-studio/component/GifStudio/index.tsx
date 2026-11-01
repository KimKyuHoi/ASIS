import { useState, type JSX } from 'react';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { useStudioSession } from '../../hook/useStudioSession';
import { errorMessage, formatBytes } from '../../lib/format-media';
import { gifStudioStrings } from '../../lib/strings';
import { Workspace } from './Workspace';

/**
 * GIF 스튜디오 창 — 녹화 직후 GIF 편집 / .gif 뷰어 / 영상 → GIF 변환 공용.
 * 미디어와 미리보기 자원은 lib/session-store 가 main push 로 채운다.
 */
export default function GifStudio(): JSX.Element {
  const t = gifStudioStrings[useLanguage()];
  const session = useStudioSession();
  // 고른 파일을 열지 못한 이유 (지원 안 하는 형식·손상 파일 등). 기존 미디어는 그대로 남는다.
  const [pickError, setPickError] = useState<string | null>(null);

  const pick = (): void => {
    setPickError(null);
    window.gifStudio.pick().catch((err: unknown) => {
      setPickError(errorMessage(err));
    });
  };

  return (
    <main className="studio">
      <header className="studio__header">
        <h1>{t.title}</h1>
        {session.status === 'empty' ? null : (
          <span className="studio__file" title={session.media.path}>
            {[
              session.media.name,
              `${session.media.width} × ${session.media.height}`,
              formatBytes(session.media.size),
            ].join(' · ')}
          </span>
        )}
        <button type="button" className="mac-btn" onClick={pick}>
          {session.status === 'empty' ? t.open : t.openAnother}
        </button>
      </header>
      {pickError === null ? null : (
        <div className="studio__error" role="alert">
          <span>{t.loadFailed(pickError)}</span>
          <button type="button" className="studio__error-close" onClick={(): void => setPickError(null)}>
            ×
          </button>
        </div>
      )}

      {session.status === 'empty' ? (
        <section className="placeholder">
          <h2>{t.emptyTitle}</h2>
          <p>{t.emptyHint}</p>
          <button type="button" className="mac-btn mac-btn--primary" onClick={pick}>
            {t.open}
          </button>
        </section>
      ) : null}
      {session.status === 'loading' ? (
        <section className="placeholder">
          <div className="spinner" aria-hidden="true" />
          <p>{t.loading}</p>
        </section>
      ) : null}
      {session.status === 'error' ? (
        <section className="placeholder placeholder--error">
          <p>{t.loadFailed(session.message)}</p>
        </section>
      ) : null}
      {session.status === 'ready' ? (
        // 미디어마다 새 Blob URL 이 생기므로 그것을 key 로 써 작업 state 를 초기화한다.
        <Workspace
          key={session.videoUrl}
          media={session.media}
          videoUrl={session.videoUrl}
          filmstripUrl={session.filmstripUrl}
        />
      ) : null}
    </main>
  );
}
