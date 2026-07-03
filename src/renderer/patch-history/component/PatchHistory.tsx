import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { PatchNote } from '../types/patch-note';

type LoadState =
  | { kind: 'loading' } |
  { kind: 'error'; message: string } |
  { kind: 'loaded'; notes: PatchNote[] };

/**
 * 변경 이력 뷰어 — GitHub Releases 를 최신순으로 표시.
 *
 * IPC 로 main 이 fetch 한 릴리스 목록을 받아 렌더한다(외부 데이터 로드라
 * useEffect + state 로 처리 — side-effects.md). body 는 마크다운 원문을 그대로
 * 보여준다(별도 렌더러 없이 가독 가능한 수준).
 */
export default function PatchHistory(): JSX.Element {
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

  if (state.kind === 'loading') {
    return (
      <div className="ph">
        <p className="ph__status">변경 이력을 불러오는 중…</p>
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="ph">
        <p className="ph__status ph__status--error">
          변경 이력을 불러오지 못했습니다.
          <br />
          {state.message}
        </p>
      </div>
    );
  }
  if (state.notes.length === 0) {
    return (
      <div className="ph">
        <p className="ph__status">아직 게시된 릴리스가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="ph">
      {state.notes.map((n) => (
        <section className="ph__item" key={n.version}>
          <header className="ph__head">
            <h2 className="ph__ver">{n.name}</h2>
            <div className="ph__meta">
              <time className="ph__date">{formatDate(n.date)}</time>
              <button
                type="button"
                className="ph__link"
                onClick={() => {
                  window.patchHistory.openUrl(n.url);
                }}
              >
                GitHub에서 보기 ↗
              </button>
            </div>
          </header>
          <pre className="ph__body">{n.body.trim() || '(내용 없음)'}</pre>
        </section>
      ))}
    </div>
  );
}

/** ISO 8601 → YYYY.MM.DD. */
function formatDate(iso: string): string {
  const d = iso.slice(0, 10);
  return d.replace(/-/g, '.');
}
