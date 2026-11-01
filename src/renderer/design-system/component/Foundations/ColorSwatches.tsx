import type { CSSProperties, JSX } from 'react';
import '../../asset/foundations.css';

const GROUPS: { title: string; tokens: string[] }[] = [
  {
    title: '텍스트',
    tokens: ['--text-primary', '--text-secondary', '--text-tertiary', '--text-disabled', '--text-link', '--text-danger'],
  },
  {
    title: '면',
    tokens: [
      '--surface-window',
      '--surface-under-page',
      '--surface-group',
      '--surface-control',
      '--surface-elevated',
      '--surface-selected',
    ],
  },
  { title: '경계', tokens: ['--border-subtle', '--border-control', '--border-strong'] },
  {
    title: '강조·상태',
    tokens: ['--accent', '--accent-fill', '--accent-tint', '--danger', '--danger-fill', '--success', '--warning'],
  },
  {
    title: '시스템 색',
    tokens: ['--red', '--orange', '--yellow', '--green', '--teal', '--blue', '--indigo', '--purple', '--pink', '--gray'],
  },
  { title: 'HUD (항상 어두움)', tokens: ['--hud-bg', '--hud-fill', '--hud-label', '--hud-label-secondary'] },
];

/** 시맨틱 색 토큰 견본. 각 판(라이트/다크)에서 실제로 풀린 색을 보여준다. */
export function ColorSwatches(): JSX.Element {
  return (
    <div className="ds-found-groups">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="ds-found-heading">{group.title}</h3>
          <ul className="ds-found-swatches">
            {group.tokens.map((token) => (
              <li key={token} className="ds-found-swatch">
                <span
                  className="ds-found-chip"
                  style={{ '--ds-chip': `var(${token})` } as CSSProperties}
                />
                <code>{token}</code>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
