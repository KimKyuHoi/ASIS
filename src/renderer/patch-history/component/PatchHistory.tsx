import { useEffect, useState, type JSX } from 'react';
import { useLanguage } from '../../../shared/i18n/use-language';
import { Button, EmptyState } from '../../design-system/component';
import { patchHistoryStrings } from '../lib/strings';
import type { PatchNote } from '../types/patch-note';
import Markdown from './Markdown';

type LoadState =
  | { kind: 'loading' } |
  { kind: 'error'; message: string } |
  { kind: 'loaded'; notes: PatchNote[] };

/**
 * 변경 이력 뷰어 — 최신 버전부터 표시.
 *
 * IPC 로 main 이 만든 목록(저장소 release-notes/ 번들 노트 + GitHub 릴리스)을 받아
 * 렌더한다(외부 데이터 로드라 useEffect + state 로 처리 — side-effects.md).
 * 본문은 현재 UI 언어의 마크다운을 작은 파서로 렌더한다.
 */
export default function PatchHistory(): JSX.Element {
  const lang = useLanguage();
  const t = patchHistoryStrings[lang];
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    window.patchHistory.list().then(
      (notes) => {
        if (active) setState({ kind: 'loaded', notes });
      },
      (err: unknown) => {
        if (active) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (state.kind === 'loading') return <Status title={t.loading} />;
  if (state.kind === 'error') return <Status title={t.loadFailed} description={state.message} />;
  if (state.notes.length === 0) return <Status title={t.empty} />;

  return (
    <div className="ph">
      {state.notes.map((n) => {
        const body = n.body[lang].trim();
        return (
          <article className="ph__item" key={n.version}>
            <header className="ph__head">
              <h2 className="ph__ver">{n.name}</h2>
              {n.date === null ? (
                // 번들 노트만 있고 아직 GitHub 에 게시되지 않은 버전 — 날짜 대신 표시.
                <span className="ph__date">{t.unpublished}</span>
              ) : (
                <time className="ph__date tabular" dateTime={n.date}>
                  {formatDate(n.date)}
                </time>
              )}
              <Button variant="plain" className="ph__link" onClick={() => openUrl(n.url)}>
                {t.viewOnGitHub}
              </Button>
            </header>
            {body ? (
              <Markdown source={body} onOpenLink={openUrl} />
            ) : (
              <p className="ph__empty">{t.noContent}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function openUrl(url: string): void {
  window.patchHistory.openUrl(url).catch((err: unknown) => {
    console.error('[asis patch-history] 링크 열기 실패', err);
  });
}

/** 목록 대신 보여 주는 상태(로딩·에러·빈 목록). */
function Status({ title, description }: { title: string; description?: string }): JSX.Element {
  return (
    <div className="ph ph--status">
      <EmptyState title={title} description={description} />
    </div>
  );
}

/** ISO 8601 → YYYY.MM.DD. */
function formatDate(iso: string): string {
  const d = iso.slice(0, 10);
  return d.replace(/-/g, '.');
}
