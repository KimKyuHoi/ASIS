import type { CSSProperties, JSX } from 'react';
import '../../asset/foundations.css';

const SPACES = ['--space-half', '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-10'];
const RADII = ['--radius-chip', '--radius-control', '--radius-group', '--radius-window', '--radius-capsule'];
const SHADOWS = ['--shadow-raised', '--shadow-floating', '--hud-shadow'];

const varStyle = (name: string, token: string): CSSProperties => ({ [name]: `var(${token})` });

/** 간격·반경·그림자 척도 — 날값 대신 이 이름들을 쓴다. */
export function TokenScales(): JSX.Element {
  return (
    <div className="ds-found-groups">
      <section>
        <h3 className="ds-found-heading">간격 (4pt 그리드)</h3>
        <ul className="ds-found-list">
          {SPACES.map((token) => (
            <li key={token} className="ds-found-scale-row">
              <code>{token}</code>
              <span className="ds-found-space" style={varStyle('--ds-size', token)} />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="ds-found-heading">반경 — 바깥이 클수록 크게</h3>
        <ul className="ds-found-swatches">
          {RADII.map((token) => (
            <li key={token} className="ds-found-swatch">
              <span className="ds-found-radius" style={varStyle('--ds-radius', token)} />
              <code>{token}</code>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="ds-found-heading">그림자</h3>
        <ul className="ds-found-swatches">
          {SHADOWS.map((token) => (
            <li key={token} className="ds-found-swatch">
              <span className="ds-found-shadow" style={varStyle('--ds-shadow', token)} />
              <code>{token}</code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
